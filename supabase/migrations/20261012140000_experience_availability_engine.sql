-- ─────────────────────────────────────────────────────────────────────────────
-- Experiences: availability becomes a RULE, not a pile of hand-typed rows.
--
-- THE PROBLEM THIS SOLVES. Prod, 2026-10-12: seven experiences, SIX schedule
-- rows in total across four months, ZERO of them upcoming. Three listings
-- (Pickle Project, BUSINESS MIXER, Let's Brew it cafe x Pottery) have never
-- had a single date created; the other three had dates that simply lapsed.
-- /experiences renders an empty page. The cause is not laziness — a host
-- fills in a title, a venue and a price, presses save, and is returned to a
-- list. Dates live on a different screen they have to go and find, and a
-- weekly class means hand-entering fifty-two rows a year.
--
-- So a host now declares a PATTERN once ("every Saturday at 2pm, 8 guests")
-- and a job keeps a rolling horizon of real slot rows materialised ahead of
-- it. The listing cannot silently go dark, because nothing has to be
-- remembered for it to stay live.
--
-- WHY MATERIALISE AT ALL, rather than generating slots on read: booking takes
-- a row lock (reserve_experience does SELECT … FOR UPDATE on the slot) and
-- capacity lives in experience_schedules.current_guests. A rule has nothing
-- to lock. So rules generate rows; rows remain the unit of booking. Nothing
-- downstream of experience_schedules changes.
--
-- DEPENDS ON migration 20261012120000, specifically the unique index
-- experience_schedules_table_start_key (table_id, start_time). That index is
-- what makes the generator idempotent — ON CONFLICT DO NOTHING below is only
-- safe because the natural key exists. Running this before it would let every
-- re-run double the calendar.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- 1 ─ The rule.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.experience_availability_rules (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id           uuid NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,

    -- Days of the week this runs on, as EXTRACT(DOW) numbers: 0 = Sunday …
    -- 6 = Saturday. An empty array is a valid "paused" state and produces
    -- nothing, which the pruner below also understands.
    byweekday          smallint[] NOT NULL DEFAULT '{}',

    -- Wall-clock time IN MANILA, not an instant. A host means "2pm", not
    -- "06:00Z" — storing the instant would silently drift the moment anything
    -- about the zone changed, and would be unreadable in the editor.
    start_time_local   time NOT NULL,
    duration_minutes   integer NOT NULL,

    -- The window the pattern applies over. ends_on NULL means ongoing, which
    -- is the whole point: an ongoing rule is a listing that never lapses.
    starts_on          date NOT NULL,
    ends_on            date,

    max_guests         integer NOT NULL,
    -- NULL inherits tables.price_per_person, mirroring how
    -- experience_schedules.price_per_person already behaves as an override.
    price_per_person   numeric,

    is_active          boolean NOT NULL DEFAULT true,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT experience_availability_rules_duration_check
        CHECK (duration_minutes > 0 AND duration_minutes <= 1440),
    CONSTRAINT experience_availability_rules_guests_check
        CHECK (max_guests > 0),
    CONSTRAINT experience_availability_rules_window_check
        CHECK (ends_on IS NULL OR ends_on >= starts_on),
    CONSTRAINT experience_availability_rules_weekday_check
        CHECK (byweekday <@ ARRAY[0,1,2,3,4,5,6]::smallint[])
);

-- The generator's only access path: active rules, by listing.
CREATE INDEX IF NOT EXISTS experience_availability_rules_active_idx
    ON public.experience_availability_rules (table_id)
    WHERE is_active;


-- ═════════════════════════════════════════════════════════════════════════════
-- 2 ─ Exceptions to the rule.
--
-- A recurring pattern is useless without a way to say "not that Saturday".
-- Kept as its own table rather than an array on the rule so a blackout covers
-- the whole listing — a host closing for a public holiday means every rule
-- on that experience, not one of them.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.experience_availability_blackouts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id      uuid NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
    blackout_date date NOT NULL,
    reason        text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT experience_availability_blackouts_unique UNIQUE (table_id, blackout_date)
);


-- ═════════════════════════════════════════════════════════════════════════════
-- 3 ─ Provenance on the slot.
--
-- Without this the pruner cannot tell a generated slot from one the host
-- typed by hand in the calendar manager, and would eventually delete the
-- hand-made ones. ON DELETE SET NULL, deliberately NOT CASCADE: deleting a
-- rule must never destroy slots people may already have booked against. An
-- orphaned slot simply becomes a manual slot and is left alone from then on.
-- ═════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.experience_schedules
    ADD COLUMN IF NOT EXISTS generated_from_rule_id uuid
    REFERENCES public.experience_availability_rules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS experience_schedules_rule_idx
    ON public.experience_schedules (generated_from_rule_id)
    WHERE generated_from_rule_id IS NOT NULL;


-- ═════════════════════════════════════════════════════════════════════════════
-- 4 ─ RLS. Both tables mirror the existing experience_schedules policy:
--     the host of the parent listing, and nobody else.
--
--     No public SELECT. Rules are authoring state; what the public reads is
--     the generated slots, which already have their own "Anyone can view"
--     policy. auth.uid() is wrapped in a scalar sub-select so it evaluates
--     once per statement rather than once per row.
-- ═════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.experience_availability_rules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experience_availability_blackouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Hosts manage their availability rules"
    ON public.experience_availability_rules;
CREATE POLICY "Hosts manage their availability rules"
    ON public.experience_availability_rules
    FOR ALL
    USING ((SELECT auth.uid()) IN (
        SELECT t.host_id FROM public.tables t WHERE t.id = experience_availability_rules.table_id
    ));

DROP POLICY IF EXISTS "Hosts manage their blackouts"
    ON public.experience_availability_blackouts;
CREATE POLICY "Hosts manage their blackouts"
    ON public.experience_availability_blackouts
    FOR ALL
    USING ((SELECT auth.uid()) IN (
        SELECT t.host_id FROM public.tables t WHERE t.id = experience_availability_blackouts.table_id
    ));


-- ═════════════════════════════════════════════════════════════════════════════
-- 5 ─ The engine.
--
-- One function, two halves, both set-based:
--   CREATE — materialise every slot the active rules imply, out to the
--            horizon, skipping blackouts and anything that already exists.
--   PRUNE  — remove generated, FUTURE, UNBOOKED slots the current rules no
--            longer imply (rule switched off, date blacked out, window moved,
--            weekday removed).
--
-- Idempotent by construction: ON CONFLICT (table_id, start_time) DO NOTHING
-- against the natural key, so running it twice, or twice concurrently, or
-- re-running after a failure, converges on the same calendar.
--
-- Called two ways:
--   extend_experience_availability()            — nightly sweep, service only
--   extend_experience_availability(<table_id>)  — by the host, right after
--                                                 saving a rule, so the
--                                                 listing is live immediately
--                                                 rather than tomorrow
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.extend_experience_availability(
    p_table_id uuid    DEFAULT NULL,
    p_days     integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_uid     uuid := auth.uid();
    v_today   date;
    v_horizon date;
    v_created integer := 0;
    v_pruned  integer := 0;
BEGIN
    -- Authorisation. SECURITY DEFINER with an explicit check rather than RLS,
    -- because the function writes experience_schedules on the host's behalf.
    IF p_table_id IS NULL THEN
        -- The full sweep is the cron's job. Cron runs with no JWT, so a NULL
        -- uid is the service context; any signed-in caller is refused.
        IF v_uid IS NOT NULL THEN
            RAISE EXCEPTION 'A full availability sweep is service-only';
        END IF;
    ELSE
        IF v_uid IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.tables t
            WHERE t.id = p_table_id AND t.host_id = v_uid
        ) THEN
            RAISE EXCEPTION 'Not your experience';
        END IF;
    END IF;

    p_days  := GREATEST(1, LEAST(COALESCE(p_days, 90), 365));
    v_today := (now() AT TIME ZONE 'Asia/Manila')::date;
    v_horizon := v_today + p_days;

    -- ── CREATE ───────────────────────────────────────────────────────────
    WITH generated AS (
        INSERT INTO public.experience_schedules (
            table_id, start_time, end_time, max_guests, price_per_person,
            status, generated_from_rule_id
        )
        SELECT
            r.table_id,
            s.slot_start,
            s.slot_start + make_interval(mins => r.duration_minutes),
            r.max_guests,
            r.price_per_person,
            'open',
            r.id
        FROM public.experience_availability_rules r
        JOIN public.tables t
          ON t.id = r.table_id
         AND t.is_experience IS TRUE
         AND t.status = 'open'
        CROSS JOIN LATERAL generate_series(
            GREATEST(r.starts_on, v_today),
            LEAST(COALESCE(r.ends_on, 'infinity'::date), v_horizon),
            interval '1 day'
        ) AS g(day_ts)
        CROSS JOIN LATERAL (
            -- Manila wall-clock -> instant. AT TIME ZONE on a `timestamp`
            -- interprets it IN that zone and yields timestamptz, which is
            -- exactly the conversion wanted here.
            SELECT ((g.day_ts::date + r.start_time_local) AT TIME ZONE 'Asia/Manila') AS slot_start
        ) s
        WHERE r.is_active
          AND (p_table_id IS NULL OR r.table_id = p_table_id)
          AND EXTRACT(DOW FROM g.day_ts)::smallint = ANY (r.byweekday)
          AND s.slot_start > now()
          AND NOT EXISTS (
              SELECT 1 FROM public.experience_availability_blackouts b
              WHERE b.table_id = r.table_id
                AND b.blackout_date = g.day_ts::date
          )
        ON CONFLICT (table_id, start_time) DO NOTHING
        RETURNING 1
    )
    SELECT count(*)::integer INTO v_created FROM generated;

    -- ── PRUNE ────────────────────────────────────────────────────────────
    -- Only ever touches rows this engine created (generated_from_rule_id),
    -- only in the future, and only with nobody booked on them. A slot with a
    -- single guest is left standing however the rule changed — the host
    -- cancels that one by hand, because somebody has paid for it.
    WITH removed AS (
        DELETE FROM public.experience_schedules sch
        USING public.experience_availability_rules r
        WHERE sch.generated_from_rule_id = r.id
          AND sch.start_time > now()
          AND COALESCE(sch.current_guests, 0) = 0
          AND (p_table_id IS NULL OR sch.table_id = p_table_id)
          AND (
                NOT r.is_active
             OR (sch.start_time AT TIME ZONE 'Asia/Manila')::date < r.starts_on
             OR (r.ends_on IS NOT NULL
                 AND (sch.start_time AT TIME ZONE 'Asia/Manila')::date > r.ends_on)
             OR EXTRACT(DOW FROM (sch.start_time AT TIME ZONE 'Asia/Manila'))::smallint
                    <> ALL (r.byweekday)
             OR EXISTS (
                    SELECT 1 FROM public.experience_availability_blackouts b
                    WHERE b.table_id = sch.table_id
                      AND b.blackout_date = (sch.start_time AT TIME ZONE 'Asia/Manila')::date
                )
          )
        RETURNING 1
    )
    SELECT count(*)::integer INTO v_pruned FROM removed;

    IF v_created > 0 OR v_pruned > 0 THEN
        RAISE LOG 'extend_experience_availability(%): created %, pruned %',
            COALESCE(p_table_id::text, 'ALL'), v_created, v_pruned;
    END IF;

    RETURN jsonb_build_object(
        'created',   v_created,
        'pruned',    v_pruned,
        'horizon_to', v_horizon
    );
END;
$function$;

COMMENT ON FUNCTION public.extend_experience_availability(uuid, integer) IS
    'Materialises experience slots from availability rules out to a rolling horizon, and prunes future unbooked generated slots the rules no longer imply. Idempotent via experience_schedules_table_start_key.';

-- anon has no business generating a calendar. (On Supabase, ALTER DEFAULT
-- PRIVILEGES grants EXECUTE to anon implicitly, so a REVOKE FROM PUBLIC alone
-- would leave anon=X behind — revoke both, explicitly, and re-grant only
-- authenticated, whose calls are then checked against host_id inside.)
REVOKE EXECUTE ON FUNCTION public.extend_experience_availability(uuid, integer)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.extend_experience_availability(uuid, integer)
    TO authenticated, service_role;


-- ═════════════════════════════════════════════════════════════════════════════
-- 6 ─ Close the anon hole on the expiry job, noticed while verifying the
--     previous migration's ACLs. expire_stale_experience_intents() showed
--     `anon=X/postgres`: callable with the public key. It only touches intents
--     already past expires_at, so the blast radius is small, but a write
--     function on the booking path should not be reachable anonymously.
--     Cron runs as the job owner and is unaffected.
-- ═════════════════════════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION public.expire_stale_experience_intents()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_experience_intents()
    TO service_role;


-- ═════════════════════════════════════════════════════════════════════════════
-- 7 ─ The heartbeat.
--
-- Daily at 18:10 UTC = 02:10 Manila — a quiet hour, and after midnight local
-- so "today" has already rolled over. Every run pushes the horizon out one
-- more day, so a listing with an ongoing rule is permanently ~90 days deep
-- and can never lapse into the empty state that put this file here.
-- ═════════════════════════════════════════════════════════════════════════════
SELECT cron.unschedule('extend-experience-availability')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'extend-experience-availability');

SELECT cron.schedule(
    'extend-experience-availability',
    '10 18 * * *',
    $$SELECT public.extend_experience_availability()$$
);
