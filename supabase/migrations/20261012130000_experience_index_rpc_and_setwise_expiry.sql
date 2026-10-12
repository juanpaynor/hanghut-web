-- ─────────────────────────────────────────────────────────────────────────────
-- Experiences: a set-based expiry job, and one RPC for the index page.
--
-- Both are scale repairs to code that is correct today and will not stay
-- correct once availability is generated instead of hand-entered. Prod has six
-- schedule rows in total; a rolling horizon turns that into tens per listing
-- per quarter, and nothing below survives that multiplication as written.
--
-- CROSS-CHECKED AGAINST PROD before writing (2026-10-12). Every column and
-- index this file depends on was read from information_schema / pg_indexes,
-- not assumed:
--   tables ........... title, description, location_name, experience_type,
--                      images (text[]), price_per_person, currency, host_id,
--                      host_avatar_url, verified_by_hanghut,
--                      visibility (NOT NULL default 'public'),
--                      status (NOT NULL), is_experience (NULLABLE boolean)
--   users ............ display_name (NOT NULL)
--   user_photos ...... idx_user_photos_one_primary — UNIQUE (user_id)
--                      WHERE is_primary, so the lateral below can never
--                      return two rows for one host
--   experience_reviews idx_experience_reviews_experience_id
--   experience_schedules experience_schedules_table_upcoming_idx
--                      (table_id, start_time) WHERE status IS DISTINCT FROM
--                      'cancelled' — added in the previous migration, and the
--                      exact index the lateral in get_experiences_index needs
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- 1 ─ expire_stale_experience_intents: set-based, and safe against overlap.
--
-- The previous body was a FOR loop doing, per expired intent: one UPDATE, one
-- decrement_experience_guests() call, and one RAISE LOG. It runs every 5
-- minutes (cron jobid 14). Three problems, none of which bite at five rows:
--
--   * per-row round trips — the work is linear in a loop rather than one pass;
--   * one log line per intent — a backlog turns the job into log spam;
--   * NO row locking. Cron does not serialise: if a run ever exceeds its 5
--     minute window the next one starts anyway, both runs select the same
--     pending intents, and capacity is released TWICE. On a paid booking
--     surface that silently oversells a slot.
--
-- Now a single statement. FOR UPDATE SKIP LOCKED makes concurrent runs
-- partition the backlog instead of fighting over it, and the release is
-- aggregated per schedule so a slot is touched once no matter how many intents
-- expired against it.
--
-- LIMIT is deliberate: a large backlog drains across successive runs rather
-- than producing one unbounded statement holding locks on thousands of rows.
--
-- Signature is unchanged (no arguments, RETURNS void) so CREATE OR REPLACE
-- applies in place and the existing cron entry keeps working untouched.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.expire_stale_experience_intents()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_expired integer := 0;
BEGIN
    WITH due AS (
        SELECT id
        FROM public.experience_purchase_intents
        WHERE status = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at < now()
        ORDER BY expires_at
        LIMIT 2000
        FOR UPDATE SKIP LOCKED
    ),
    expired AS (
        UPDATE public.experience_purchase_intents i
           SET status = 'expired'
          FROM due
         WHERE i.id = due.id
        RETURNING i.schedule_id, i.quantity
    ),
    released AS (
        SELECT schedule_id, SUM(quantity)::integer AS qty
        FROM expired
        WHERE schedule_id IS NOT NULL
        GROUP BY schedule_id
    ),
    -- A data-modifying CTE always executes exactly once, whether or not the
    -- primary query reads it. GREATEST(0, …) is kept from the old
    -- decrement_experience_guests path so a double-release can never drive
    -- current_guests negative — and the capacity CHECK added in the previous
    -- migration now backstops the other direction too.
    decremented AS (
        UPDATE public.experience_schedules s
           SET current_guests = GREATEST(0, COALESCE(s.current_guests, 0) - r.qty)
          FROM released r
         WHERE s.id = r.schedule_id
        RETURNING 1
    )
    SELECT count(*)::integer INTO v_expired FROM expired;

    -- One line per RUN, not per intent, and only when something happened.
    IF v_expired > 0 THEN
        RAISE LOG 'expire_stale_experience_intents: expired % intent(s)', v_expired;
    END IF;
END;
$function$;

COMMENT ON FUNCTION public.expire_stale_experience_intents() IS
    'Expires overdue pending experience intents and returns their capacity, in one pass. FOR UPDATE SKIP LOCKED so overlapping cron runs cannot double-release a slot.';


-- ═════════════════════════════════════════════════════════════════════════════
-- 2 ─ get_experiences_index: the whole /experiences page in one round trip.
--
-- WHAT IT REPLACES. The page currently issues four queries and finishes the
-- job in JavaScript:
--   1. every open experience WITH EVERY ONE OF ITS SCHEDULES embedded, no
--      LIMIT — then `.filter(hasUpcomingSlot)` in JS. The schedules are never
--      rendered; they are fetched solely to answer "does this have a future
--      date?". Every past slot crosses the wire and is discarded.
--   2. users, for host display names
--   3. user_photos, for host avatars
--   4. EVERY REVIEW ROW for every listing, averaged in JS.
--
-- At six schedule rows that is invisible. With generated availability it is
-- tens of thousands of rows fetched and thrown away per page load, growing
-- forever because past slots are never excluded. Queries 1 and 4 are both
-- "pull the whole table to compute one number per listing".
--
-- The EXISTS-style test is now a lateral aggregate that the new
-- experience_schedules_table_upcoming_idx serves directly, and the page gets
-- back exactly what it renders: card fields, the NEXT start time, how many
-- upcoming dates there are, host identity, and the rating already averaged.
--
-- ORDERING CHANGE, FLAGGED DELIBERATELY: the page ordered by created_at DESC
-- (newest listing first). This orders by the soonest upcoming date. On a
-- product whose listings are evergreen and whose dates recur, "when was this
-- created" stops meaning anything to a buyer. Change the ORDER BY if you
-- disagree — it is one line and nothing else depends on it.
--
-- SECURITY DEFINER with an explicit, tight WHERE rather than leaning on RLS:
-- `tables` also holds private hangouts, so the filter names every condition
-- that makes a row public — including visibility, which the old page query
-- never checked at all.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_experiences_index(
    p_type   text    DEFAULT NULL,
    p_limit  integer DEFAULT 24,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id                  uuid,
    title               text,
    description         text,
    location_name       text,
    experience_type     text,
    images              text[],
    price_per_person    numeric,
    currency            text,
    host_id             uuid,
    host_name           text,
    host_photo_url      text,
    verified_by_hanghut boolean,
    next_start_time     timestamptz,
    upcoming_slots      integer,
    rating_avg          numeric,
    rating_count        integer,
    total_count         bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    WITH listed AS (
        SELECT
            t.id, t.title, t.description, t.location_name, t.experience_type,
            t.images, t.price_per_person, t.currency, t.host_id,
            t.host_avatar_url, t.verified_by_hanghut,
            nxt.next_start_time,
            nxt.upcoming_slots
        FROM public.tables t
        -- JOIN LATERAL (not LEFT) with upcoming_slots > 0 is the "has a
        -- bookable date" predicate, in SQL. 'full' slots still count: a
        -- sold-out date is genuine supply and stays listed, unlike a listing
        -- with nothing at all. IS DISTINCT FROM, not <>, because status is
        -- nullable and <> would silently drop a NULL-status slot.
        JOIN LATERAL (
            SELECT
                min(s.start_time)  AS next_start_time,
                count(*)::integer  AS upcoming_slots
            FROM public.experience_schedules s
            WHERE s.table_id = t.id
              AND s.start_time > now()
              AND s.status IS DISTINCT FROM 'cancelled'
        ) nxt ON nxt.upcoming_slots > 0
        WHERE t.is_experience IS TRUE
          AND t.status        = 'open'
          AND t.visibility    = 'public'
          AND (p_type IS NULL OR p_type = 'all' OR t.experience_type = p_type)
    )
    SELECT
        l.id, l.title, l.description, l.location_name, l.experience_type,
        l.images, l.price_per_person, l.currency, l.host_id,
        COALESCE(u.display_name, 'Host')              AS host_name,
        COALESCE(ph.photo_url, l.host_avatar_url)     AS host_photo_url,
        COALESCE(l.verified_by_hanghut, false)        AS verified_by_hanghut,
        l.next_start_time,
        l.upcoming_slots,
        COALESCE(rv.rating_avg, 0)::numeric           AS rating_avg,
        COALESCE(rv.rating_count, 0)                  AS rating_count,
        -- Window functions are evaluated before LIMIT, so this is the full
        -- match count and the caller can paginate without a second query.
        count(*) OVER ()                              AS total_count
    FROM listed l
    LEFT JOIN public.users u ON u.id = l.host_id
    LEFT JOIN LATERAL (
        SELECT p.photo_url
        FROM public.user_photos p
        WHERE p.user_id = l.host_id AND p.is_primary
        LIMIT 1
    ) ph ON true
    LEFT JOIN LATERAL (
        SELECT round(avg(r.rating)::numeric, 1) AS rating_avg,
               count(*)::integer                AS rating_count
        FROM public.experience_reviews r
        WHERE r.experience_id = l.id
    ) rv ON true
    ORDER BY l.next_start_time ASC
    -- Clamped server-side: a caller cannot ask for an unbounded page, which is
    -- the exact failure mode this function exists to remove.
    LIMIT  GREATEST(1, LEAST(COALESCE(p_limit, 24), 60))
    OFFSET GREATEST(0, COALESCE(p_offset, 0));
$function$;

COMMENT ON FUNCTION public.get_experiences_index(text, integer, integer) IS
    'One round trip for /experiences: listings with a bookable future date, next date, host, rating and total count. Replaces fetching every schedule and every review and reducing them in JS.';

-- Read-only and public by design — this IS the public index. Stated
-- explicitly rather than inherited: ALTER DEFAULT PRIVILEGES grants EXECUTE to
-- anon anyway, so being deliberate about which functions are anon-callable is
-- what keeps the ones that should NOT be (reserve_experience) honest.
GRANT EXECUTE ON FUNCTION public.get_experiences_index(text, integer, integer)
    TO anon, authenticated;
