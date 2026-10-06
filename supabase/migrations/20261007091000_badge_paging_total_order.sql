-- ============================================================================
-- Make every paged ORDER BY a TOTAL order.
--
-- LIMIT/OFFSET over a non-total order is not stable: the database is free to
-- break ties differently per query, so a row can appear on two pages and
-- another on none.
--
-- Not hypothetical here. now() is transaction-scoped and the engine awards a
-- badge's whole qualifying set in ONE statement, so 298 of the 306 holders of
-- "Ngoolchella Attendee" carry a byte-identical earned_at. Ordering by
-- earned_at alone left 298 rows in arbitrary order, re-decided on every call.
--
-- buyer_email is the tiebreak: UNIQUE per badge by constraint
-- (user_creator_badges_unique on (badge_id, buyer_email)), so appending it makes
-- the order total. The loyal core gets the same treatment -- badge_count ties
-- constantly (everyone there holds 2) and spend ties are common.
--
-- Verified by walking every page: 306 rows seen / 306 distinct on BOTH the
-- recent and spend sorts, 0 holders never shown, and 23/23 for the loyal core.
--
-- Full bodies are re-stated because CREATE OR REPLACE FUNCTION has no way to
-- amend one clause.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_badge_holders(
    p_badge_id        uuid,
    p_limit           integer DEFAULT 50,
    p_offset          integer DEFAULT 0,
    p_search          text    DEFAULT NULL,
    p_sort            text    DEFAULT 'recent'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
    v_organizer uuid;
    v_fast      boolean;
    v_want_sum  boolean;
    v_total     integer;
    v_summary   jsonb := NULL;
    v_rows      jsonb;
BEGIN
    SELECT organizer_id INTO v_organizer FROM creator_badges WHERE id = p_badge_id;
    IF v_organizer IS NULL THEN
        RAISE EXCEPTION 'Badge not found';
    END IF;
    IF NOT public.can_manage_partner(v_organizer) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    -- FAST PATH: the default view -- newest first, no search.
    --
    -- Measured before this existed: asking for 1 row cost the same as 25, and
    -- page 13 cost the same as page 1 (~53ms for 306 holders), because
    -- organizer_customer_value was computed for EVERY holder on every page and
    -- only then truncated by LIMIT. Transfer was paged; work was not.
    --
    -- Here the page is chosen from user_creator_badges alone -- one indexed
    -- table, ordered by a stored column -- and only those rows are decorated, so
    -- cost follows the page instead of the badge.
    --
    -- Search and the spend/name sorts cannot use it and do not pretend to:
    -- ranking by lifetime spend requires every holder's spend, and name search
    -- has to match the guest_name that only the value function resolves. Those
    -- keep the whole-set path, which is correct, just not cheap.
    v_fast := (COALESCE(p_sort, 'recent') = 'recent' AND p_search IS NULL);

    -- The summary is identical on every page, and it is the only part that
    -- genuinely needs all holders decorated. So it rides the FIRST page only and
    -- the client keeps the copy it already has while paging.
    --
    -- This is keyed off p_offset rather than a p_include_summary flag because
    -- adding a sixth parameter would have created an OVERLOAD, not a
    -- replacement -- leaving the old whole-set body live under the 5-arg
    -- signature, and dropping that was refused.
    v_want_sum := COALESCE(p_offset, 0) = 0;

    IF v_want_sum THEN
        WITH holders AS (
            SELECT ucb.buyer_email AS email, ucb.earned_at, ucb.grant_type,
                   (ucb.user_id IS NOT NULL) AS has_account
            FROM user_creator_badges ucb WHERE ucb.badge_id = p_badge_id
        ),
        val AS (
            SELECT * FROM public.organizer_customer_value(
                v_organizer, ARRAY(SELECT email FROM holders))
        )
        SELECT jsonb_build_object(
            'holders',      count(*),
            'with_account', count(*) FILTER (WHERE h.has_account),
            'hand_granted', count(*) FILTER (WHERE h.grant_type <> 'auto'),
            'total_spent',  COALESCE(sum(COALESCE(v.total_spent,0)), 0),
            'avg_spent',    COALESCE(round(avg(COALESCE(v.total_spent,0)), 2), 0),
            'champions',    count(*) FILTER (WHERE v.rfm_segment = 'champion'),
            'first_earned', min(h.earned_at),
            'last_earned',  max(h.earned_at)
        ) INTO v_summary
        FROM holders h LEFT JOIN val v ON v.email = h.email;
    END IF;

    IF v_fast THEN
        -- No search on this path, so the count is just the badge's holders.
        SELECT count(*) INTO v_total
          FROM user_creator_badges WHERE badge_id = p_badge_id;

        WITH page AS (
            SELECT ucb.buyer_email AS email, ucb.earned_at, ucb.grant_type,
                   (ucb.user_id IS NOT NULL) AS has_account
            FROM user_creator_badges ucb
            WHERE ucb.badge_id = p_badge_id
            ORDER BY ucb.earned_at DESC, ucb.buyer_email
            LIMIT p_limit OFFSET p_offset
        ),
        val AS (
            SELECT * FROM public.organizer_customer_value(
                v_organizer, ARRAY(SELECT email FROM page))
        )
        SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb) INTO v_rows
        FROM (
            SELECT p.email, COALESCE(v.name, u.display_name) AS name,
                   p.earned_at, p.grant_type, p.has_account,
                   COALESCE(v.events_purchased,0) AS events_purchased,
                   COALESCE(v.events_attended,0)  AS events_attended,
                   COALESCE(v.total_spent,0)      AS total_spent,
                   v.rfm_segment, v.last_activity
            FROM page p
            LEFT JOIN val v ON v.email = p.email
            LEFT JOIN users u ON lower(u.email) = p.email
            ORDER BY p.earned_at DESC, p.email
        ) x;
    ELSE
        WITH holders AS (
            SELECT ucb.buyer_email AS email, ucb.earned_at, ucb.grant_type,
                   (ucb.user_id IS NOT NULL) AS has_account
            FROM user_creator_badges ucb WHERE ucb.badge_id = p_badge_id
        ),
        val AS (
            SELECT * FROM public.organizer_customer_value(
                v_organizer, ARRAY(SELECT email FROM holders))
        ),
        joined AS (
            SELECT h.email, COALESCE(v.name, u.display_name) AS name,
                   h.earned_at, h.grant_type, h.has_account,
                   COALESCE(v.events_purchased,0) AS events_purchased,
                   COALESCE(v.events_attended,0)  AS events_attended,
                   COALESCE(v.total_spent,0)      AS total_spent,
                   v.rfm_segment, v.last_activity
            FROM holders h
            LEFT JOIN val v ON v.email = h.email
            LEFT JOIN users u ON lower(u.email) = h.email
        )
        -- v_total is counted from the SAME filtered set the rows come from.
        -- Counting the base table instead would match a guest on display_name
        -- only, while the rows match on the resolved guest_name -- and the pager
        -- would then promise rows the list could not show.
        , filtered AS (
            SELECT * FROM joined
            WHERE p_search IS NULL
               OR email ILIKE '%'||p_search||'%'
               OR COALESCE(name,'') ILIKE '%'||p_search||'%'
        )
        SELECT (SELECT count(*) FROM filtered),
               COALESCE((SELECT jsonb_agg(row_to_json(x)) FROM (
                   SELECT * FROM filtered
                   ORDER BY
                       CASE WHEN p_sort = 'spend' THEN total_spent END DESC NULLS LAST,
                       CASE WHEN p_sort = 'name'  THEN COALESCE(name, email) END ASC NULLS LAST,
                       earned_at DESC,
                       email
                   LIMIT p_limit OFFSET p_offset
               ) x), '[]'::jsonb)
        INTO v_total, v_rows;
    END IF;

    RETURN jsonb_build_object('total', v_total, 'summary', v_summary, 'holders', v_rows);
END;
$fn$;


-- ---------------------------------------------------------------------------
-- Loyal core: same fix. `email` appended as the final tiebreak; body otherwise
-- unchanged from 20261006160000_badge_analytics.sql.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_badge_loyal_core(
    p_organizer_id uuid,
    p_min_badges   integer DEFAULT 2,
    p_limit        integer DEFAULT 50,
    p_offset       integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
    v_result jsonb;
BEGIN
    IF NOT public.can_manage_partner(p_organizer_id) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    WITH core AS (
        SELECT u.buyer_email AS email,
               count(DISTINCT u.badge_id)::int AS badge_count,
               bool_or(u.user_id IS NOT NULL)  AS has_account,
               max(u.earned_at)                AS latest_earned,
               jsonb_agg(DISTINCT jsonb_build_object('id', b.id, 'name', b.name, 'tier', b.tier)) AS badges
        FROM user_creator_badges u
        JOIN creator_badges b ON b.id = u.badge_id
        WHERE b.organizer_id = p_organizer_id
        GROUP BY u.buyer_email
        HAVING count(DISTINCT u.badge_id) >= GREATEST(p_min_badges, 1)
    ),
    val AS (
        SELECT * FROM public.organizer_customer_value(
            p_organizer_id, ARRAY(SELECT email FROM core)
        )
    ),
    joined AS (
        SELECT c.email,
               COALESCE(v.name, u.display_name) AS name,
               c.badge_count, c.has_account, c.badges, c.latest_earned,
               COALESCE(v.events_purchased, 0) AS events_purchased,
               COALESCE(v.events_attended, 0)  AS events_attended,
               COALESCE(v.total_spent, 0)      AS total_spent,
               v.rfm_segment, v.last_activity
        FROM core c
        LEFT JOIN val v ON v.email = c.email
        LEFT JOIN users u ON lower(u.email) = c.email
    )
    SELECT jsonb_build_object(
        'total',   (SELECT count(*) FROM joined),
        'summary', (SELECT jsonb_build_object(
            'people',        count(*),
            'total_spent',   COALESCE(sum(total_spent), 0),
            'avg_spent',     COALESCE(round(avg(total_spent), 2), 0),
            'max_badges',    COALESCE(max(badge_count), 0),
            'with_account',  count(*) FILTER (WHERE has_account)
        ) FROM joined),
        'people', COALESCE((SELECT jsonb_agg(row_to_json(x)) FROM (
            SELECT email, name, badge_count, has_account, badges, latest_earned,
                   events_purchased, events_attended, total_spent, rfm_segment, last_activity
            FROM joined
            -- email last: badge_count and total_spent tie constantly (everyone
            -- here holds 2, and ties on spend are common), so without it the
            -- pager is not stable.
            ORDER BY badge_count DESC, total_spent DESC, latest_earned DESC, email
            LIMIT p_limit OFFSET p_offset
        ) x), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$fn$;
