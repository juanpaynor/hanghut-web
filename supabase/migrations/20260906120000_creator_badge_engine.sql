-- ============================================================================
-- Creator badge counting engine (criteria contract v1, team_comms #239)
-- ============================================================================
--
-- Eight criteria types. manual_grant is already served by grant_creator_badge();
-- this migration adds the seven EVALUATED types, plus the builder preview.
--
-- ONE QUERY SET, TWO CALLERS. The qualifying-email logic lives in exactly one
-- function, which both the award engine and the dashboard preview call. Writing
-- it twice would eventually let them disagree, and a builder that promises "12
-- people qualify" against an engine that awards 3 is worse than showing nothing:
-- the partner publishes a badge on a number we made up.
--
-- EMAIL IS THE CUSTOMER KEY, not user_id. ~30% of ticket holders are guests with
-- user_id NULL, and they are the strongest-signal third because they paid. Every
-- branch below resolves user_id -> users.email and guest_email alike, exactly as
-- user_creator_badges is keyed.
--
-- PARTNER-SCOPED ALWAYS. Every branch filters events.organizer_id, including the
-- ones that take an event_id parameter — a partner must not be able to author a
-- badge that evaluates against somebody else's event.
--
-- REFUNDS. Two different rules, both deliberate:
--   - ticket counts exclude status IN ('cancelled','refunded')
--   - spend is SUM(total_amount - COALESCE(refunded_amount,0)) clamped at >= 0,
--     because a PARTIAL refund leaves purchase_intents.status = 'completed' and
--     only moves refunded_amount. Filtering on status alone counts refunded
--     money as spend. There are live partially-refunded intents on prod today.

-- ----------------------------------------------------------------------------
-- The engine. STABLE and set-based: one query per type, no row loops.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.creator_badge_qualifying_emails(
    p_organizer_id uuid,
    p_criteria     jsonb
)
RETURNS TABLE (buyer_email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_type     text  := p_criteria->>'type';
    v_params   jsonb := coalesce(p_criteria->'params', '{}'::jsonb);
    v_n        integer;
    v_event_id uuid;
BEGIN
    IF p_organizer_id IS NULL OR v_type IS NULL THEN
        RETURN;
    END IF;

    -- manual_grant is never evaluated. Returning empty (rather than raising) keeps
    -- the preview honest: "0 qualify automatically" is the true answer for it.
    IF v_type = 'manual_grant' THEN
        RETURN;
    END IF;

    IF v_type = 'attendance_count' THEN
        -- DISTINCT events of this partner where the customer checked in.
        v_n := coalesce((v_params->>'n')::integer, 1);
        RETURN QUERY
        SELECT s.em
        FROM (
            SELECT coalesce(lower(us.email), lower(t.guest_email)) AS em, t.event_id
            FROM tickets t
            JOIN events e ON e.id = t.event_id
            LEFT JOIN users us ON us.id = t.user_id
            WHERE e.organizer_id = p_organizer_id
              AND t.checked_in_at IS NOT NULL
              AND t.status NOT IN ('cancelled', 'refunded')
        ) s
        WHERE s.em IS NOT NULL AND btrim(s.em) <> ''
        GROUP BY s.em
        HAVING count(DISTINCT s.event_id) >= v_n;

    ELSIF v_type = 'checkin_count' THEN
        -- TOTAL check-ins, not distinct events: a multi-day or recurring event
        -- counts each scan, which is the point of having both types.
        v_n := coalesce((v_params->>'n')::integer, 1);
        RETURN QUERY
        SELECT s.em
        FROM (
            SELECT coalesce(lower(us.email), lower(t.guest_email)) AS em
            FROM tickets t
            JOIN events e ON e.id = t.event_id
            LEFT JOIN users us ON us.id = t.user_id
            WHERE e.organizer_id = p_organizer_id
              AND t.checked_in_at IS NOT NULL
              AND t.status NOT IN ('cancelled', 'refunded')
        ) s
        WHERE s.em IS NOT NULL AND btrim(s.em) <> ''
        GROUP BY s.em
        HAVING count(*) >= v_n;

    ELSIF v_type = 'spend_total' THEN
        -- Net of refunds, clamped per-order so one over-refunded order cannot
        -- drag a customer's lifetime total below what they actually paid.
        RETURN QUERY
        SELECT s.em
        FROM (
            SELECT coalesce(lower(us.email), lower(pi.guest_email)) AS em,
                   greatest(coalesce(pi.total_amount, 0) - coalesce(pi.refunded_amount, 0), 0) AS net
            FROM purchase_intents pi
            JOIN events e ON e.id = pi.event_id
            LEFT JOIN users us ON us.id = pi.user_id
            WHERE e.organizer_id = p_organizer_id
              AND pi.status = 'completed'
        ) s
        WHERE s.em IS NOT NULL AND btrim(s.em) <> ''
        GROUP BY s.em
        HAVING sum(s.net) >= coalesce((v_params->>'amount')::numeric, 0);

    ELSIF v_type = 'specific_event' THEN
        v_event_id := (v_params->>'event_id')::uuid;
        IF v_event_id IS NULL THEN RETURN; END IF;

        IF coalesce(v_params->>'mode', 'attended') = 'attended' THEN
            RETURN QUERY
            SELECT DISTINCT coalesce(lower(us.email), lower(t.guest_email))
            FROM tickets t
            JOIN events e ON e.id = t.event_id
            LEFT JOIN users us ON us.id = t.user_id
            WHERE e.organizer_id = p_organizer_id
              AND t.event_id = v_event_id
              AND t.checked_in_at IS NOT NULL
              AND t.status NOT IN ('cancelled', 'refunded')
              AND coalesce(lower(us.email), lower(t.guest_email)) IS NOT NULL;
        ELSE
            RETURN QUERY
            SELECT DISTINCT coalesce(lower(us.email), lower(pi.guest_email))
            FROM purchase_intents pi
            JOIN events e ON e.id = pi.event_id
            LEFT JOIN users us ON us.id = pi.user_id
            WHERE e.organizer_id = p_organizer_id
              AND pi.event_id = v_event_id
              AND pi.status = 'completed'
              AND coalesce(lower(us.email), lower(pi.guest_email)) IS NOT NULL;
        END IF;

    ELSIF v_type = 'first_n_buyers' THEN
        -- Ranked on each customer's FIRST paid order, not on orders: a repeat
        -- buyer must occupy one slot, not three. Tie-break on intent id so the
        -- ordering is total and re-evaluation is stable.
        v_n        := coalesce((v_params->>'n')::integer, 0);
        v_event_id := CASE WHEN coalesce(v_params->>'scope', 'partner') = 'event'
                           THEN (v_params->>'event_id')::uuid END;
        RETURN QUERY
        WITH base AS (
            SELECT coalesce(lower(us.email), lower(pi.guest_email)) AS em,
                   pi.paid_at, pi.id
            FROM purchase_intents pi
            JOIN events e ON e.id = pi.event_id
            LEFT JOIN users us ON us.id = pi.user_id
            WHERE e.organizer_id = p_organizer_id
              AND pi.status = 'completed'
              AND pi.paid_at IS NOT NULL
              AND (v_event_id IS NULL OR pi.event_id = v_event_id)
        ),
        firsts AS (
            SELECT DISTINCT ON (em) em, paid_at, id
            FROM base
            WHERE em IS NOT NULL AND btrim(em) <> ''
            ORDER BY em, paid_at, id
        ),
        ranked AS (
            SELECT em, row_number() OVER (ORDER BY paid_at, id) AS rn
            FROM firsts
        )
        SELECT em FROM ranked WHERE rn <= v_n;

    ELSIF v_type = 'group_buyer' THEN
        -- >= min_quantity LIVE tickets in a single paid order. Counting tickets
        -- rather than purchase_intents.quantity means a partly refunded group
        -- order stops qualifying, which matches the ticket-count refund rule.
        v_n := coalesce((v_params->>'min_quantity')::integer, 2);
        RETURN QUERY
        SELECT DISTINCT s.em
        FROM (
            SELECT coalesce(lower(us.email), lower(pi.guest_email)) AS em,
                   pi.id AS intent_id,
                   count(t.id) AS qty
            FROM purchase_intents pi
            JOIN events e ON e.id = pi.event_id
            LEFT JOIN users us ON us.id = pi.user_id
            JOIN tickets t ON t.purchase_intent_id = pi.id
                          AND t.status NOT IN ('cancelled', 'refunded')
            WHERE e.organizer_id = p_organizer_id
              AND pi.status = 'completed'
            GROUP BY 1, 2
        ) s
        WHERE s.em IS NOT NULL AND btrim(s.em) <> '' AND s.qty >= v_n;

    ELSIF v_type = 'streak_months' THEN
        -- Consecutive CALENDAR months in Asia/Manila. Not UTC: we hold live
        -- events whose stored times straddle the UTC boundary, so a late-night
        -- Manila purchase would otherwise land in the wrong month and silently
        -- break a streak the customer actually had.
        v_n := coalesce((v_params->>'n')::integer, 2);
        RETURN QUERY
        WITH months AS (
            SELECT DISTINCT
                   coalesce(lower(us.email), lower(pi.guest_email)) AS em,
                   date_trunc('month', pi.paid_at AT TIME ZONE 'Asia/Manila') AS m
            FROM purchase_intents pi
            JOIN events e ON e.id = pi.event_id
            LEFT JOIN users us ON us.id = pi.user_id
            WHERE e.organizer_id = p_organizer_id
              AND pi.status = 'completed'
              AND pi.paid_at IS NOT NULL
        ),
        grouped AS (
            -- Classic gaps-and-islands: consecutive months share (month# - rownum).
            SELECT em, m,
                   (extract(year FROM m) * 12 + extract(month FROM m))
                     - row_number() OVER (PARTITION BY em ORDER BY m) AS island
            FROM months
            WHERE em IS NOT NULL AND btrim(em) <> ''
        )
        SELECT DISTINCT em
        FROM grouped
        GROUP BY em, island
        HAVING count(*) >= v_n;

    END IF;

    RETURN;
END;
$$;

COMMENT ON FUNCTION public.creator_badge_qualifying_emails(uuid, jsonb) IS
    'Lowercased emails qualifying for a criteria object, scoped to one organizer. Shared by evaluate_creator_badge and preview_creator_badge_earners so award and preview can never disagree.';

-- ----------------------------------------------------------------------------
-- Award. Idempotent by UNIQUE (badge_id, buyer_email) — safe to re-run forever.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_creator_badge(p_badge_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_badge   record;
    v_awarded integer;
BEGIN
    SELECT b.id, b.criteria, b.organizer_id, b.is_active
      INTO v_badge
      FROM creator_badges b
     WHERE b.id = p_badge_id;

    IF v_badge IS NULL THEN
        RAISE EXCEPTION 'Badge not found';
    END IF;

    IF v_badge.criteria->>'type' = 'manual_grant' THEN
        RETURN jsonb_build_object('success', true, 'awarded', 0, 'skipped', 'manual_grant');
    END IF;

    IF v_badge.is_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', true, 'awarded', 0, 'skipped', 'inactive');
    END IF;

    -- Badges are PERMANENT (#239): never revoked, even if a later refund drops
    -- someone under the threshold. So this only ever inserts.
    INSERT INTO user_creator_badges (badge_id, user_id, buyer_email, grant_type, granted_by)
    SELECT p_badge_id, u.id, q.buyer_email, 'auto', NULL
      FROM public.creator_badge_qualifying_emails(v_badge.organizer_id, v_badge.criteria) q
      LEFT JOIN LATERAL (
          SELECT id FROM users WHERE lower(email) = q.buyer_email LIMIT 1
      ) u ON true
    ON CONFLICT (badge_id, buyer_email) DO NOTHING;

    GET DIAGNOSTICS v_awarded = ROW_COUNT;

    -- Absolute recompute, never an increment — denormalised counters on this
    -- platform have drifted from reality more than once.
    PERFORM public.recompute_badge_holder_count(p_badge_id);

    RETURN jsonb_build_object('success', true, 'awarded', v_awarded);
END;
$$;

-- ----------------------------------------------------------------------------
-- Sweep every active badge. Intended for a scheduled job.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_all_creator_badges()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_badge   record;
    v_total   integer := 0;
    v_badges  integer := 0;
BEGIN
    FOR v_badge IN
        SELECT id FROM creator_badges
         WHERE is_active = true AND criteria->>'type' <> 'manual_grant'
    LOOP
        v_total  := v_total + coalesce((public.evaluate_creator_badge(v_badge.id)->>'awarded')::integer, 0);
        v_badges := v_badges + 1;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'badges_evaluated', v_badges, 'awarded', v_total);
END;
$$;

-- ----------------------------------------------------------------------------
-- Builder preview: "how many of my buyers qualify RIGHT NOW?"
--
-- Promised to the app team in #294 as the alternative to hiding the attendance
-- criteria. The failure mode worth preventing is a partner publishing "attend 3
-- of my events" that nobody can ever earn — which is a question about THEIR
-- data, answerable before publishing, not a reason to remove the criterion.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_creator_badge_earners(
    p_organizer_id uuid,
    p_criteria     jsonb
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_count integer;
BEGIN
    -- SECURITY DEFINER with a caller-supplied organizer_id: without this check
    -- anyone could probe another partner's customer counts by guessing ids.
    IF auth.uid() IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM partners
            WHERE id = p_organizer_id AND user_id = auth.uid()
       )
       AND NOT EXISTS (
           SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true
       )
    THEN
        RAISE EXCEPTION 'Not authorised to preview badges for this organizer';
    END IF;

    SELECT count(*) INTO v_count
      FROM public.creator_badge_qualifying_emails(p_organizer_id, p_criteria);

    RETURN coalesce(v_count, 0);
END;
$$;

-- The engine functions run as their owner and are reachable through PostgREST,
-- so PUBLIC must not keep the implicit EXECUTE grant.
REVOKE EXECUTE ON FUNCTION public.creator_badge_qualifying_emails(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.evaluate_creator_badge(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.evaluate_all_creator_badges() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.preview_creator_badge_earners(uuid, jsonb) FROM PUBLIC;

-- The preview is the only one a partner's browser calls; it checks ownership
-- itself. Awarding and the raw email list stay server-side (service role).
GRANT EXECUTE ON FUNCTION public.preview_creator_badge_earners(uuid, jsonb) TO authenticated;
