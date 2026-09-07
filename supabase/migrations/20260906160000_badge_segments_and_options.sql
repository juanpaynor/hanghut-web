-- ============================================================================
-- Badge criteria v1.1 — customer segments + two more purchase-side options,
-- and a schedule so badges award without anyone pressing a button.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ONE definition of a customer segment.
--
-- The organizer sees Champions / Loyal / At-risk / Lost / New on the Customers
-- page. A badge that says "champion" and means something ELSE than that page is
-- the bug that matters here, so the RFM logic is extracted once and both sides
-- are meant to read it.
--
-- This mirrors get_organizer_customers() exactly — same signals, same per-event
-- rollup, same thresholds. That function is live and busy, so this migration
-- does NOT rewrite it; the intended follow-up is to have it call this function
-- instead of carrying its own copy. Until then, any change to the thresholds
-- below must be made in BOTH places.
--
-- Note "activity", not "purchase": recency and first-seen come from engagement
-- (purchases, registrations, attendance, abandoned carts), which is what the
-- Customers page measures. A purchase-only recency would quietly disagree with
-- the number the organizer clicked from.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.organizer_customer_segments(p_organizer_id uuid)
RETURNS TABLE (
    email            text,
    rfm_segment      text,
    events_purchased integer,
    events_attended  integer,
    no_shows         integer,
    total_spent      numeric,
    recency_days     integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    WITH org_events AS (
        SELECT id, start_datetime FROM events WHERE organizer_id = p_organizer_id
    ),
    signals AS (
        SELECT lower(COALESCE(u.email, p.guest_email)) AS email,
               p.event_id,
               CASE WHEN p.status = 'completed' THEN 'purchased' ELSE 'abandoned' END AS signal,
               COALESCE(p.paid_at, p.created_at) AS occurred_at
        FROM purchase_intents p
        JOIN org_events e ON e.id = p.event_id
        LEFT JOIN users u ON u.id = p.user_id
        WHERE COALESCE(u.email, p.guest_email) IS NOT NULL
          AND p.status IN ('completed','expired','failed')
        UNION ALL
        SELECT lower(COALESCE(u.email, r.guest_email)), r.event_id,
               CASE WHEN r.status = 'rejected' THEN 'rejected' ELSE 'registered' END, r.created_at
        FROM event_registrations r
        JOIN org_events e ON e.id = r.event_id
        LEFT JOIN users u ON u.id = r.user_id
        WHERE COALESCE(u.email, r.guest_email) IS NOT NULL
        UNION ALL
        SELECT lower(COALESCE(u.email, t.guest_email)), t.event_id,
               CASE WHEN t.status = 'used' OR t.checked_in_at IS NOT NULL THEN 'attended'
                    WHEN t.status = 'valid' AND oe.start_datetime < now() THEN 'noshow'
                    ELSE 'has_ticket' END,
               oe.start_datetime
        FROM tickets t
        JOIN org_events oe ON oe.id = t.event_id
        LEFT JOIN users u ON u.id = t.user_id
        WHERE COALESCE(u.email, t.guest_email) IS NOT NULL
          AND t.status IN ('valid','used')
    ),
    spend AS (
        SELECT lower(COALESCE(u.email, p.guest_email)) AS email,
               sum(COALESCE(p.total_amount,0) - COALESCE(p.refunded_amount,0)) AS total_spent
        FROM purchase_intents p
        JOIN org_events e ON e.id = p.event_id
        LEFT JOIN users u ON u.id = p.user_id
        WHERE p.status = 'completed' AND COALESCE(u.email, p.guest_email) IS NOT NULL
        GROUP BY 1
    ),
    per_event AS (
        SELECT email, event_id,
               bool_or(signal = 'purchased') AS purchased,
               bool_or(signal = 'attended')  AS attended,
               bool_or(signal = 'noshow')    AS noshow,
               min(occurred_at) AS first_at, max(occurred_at) AS last_at
        FROM signals GROUP BY email, event_id
    ),
    cust AS (
        SELECT pe.email,
               count(*) FILTER (WHERE pe.purchased)                      AS events_purchased,
               count(*) FILTER (WHERE pe.attended)                       AS events_attended,
               count(*) FILTER (WHERE pe.noshow AND NOT pe.attended)     AS no_shows,
               COALESCE(s.total_spent, 0)::numeric                       AS total_spent,
               min(pe.first_at) AS first_seen,
               GREATEST(0, (current_date - max(pe.last_at)::date))::int  AS recency_days
        FROM per_event pe
        LEFT JOIN spend s ON s.email = pe.email
        GROUP BY pe.email, s.total_spent
    )
    SELECT email,
           CASE
               WHEN events_purchased = 0 THEN NULL
               WHEN recency_days > 240 THEN 'lost'
               WHEN recency_days > 120 THEN 'at_risk'
               WHEN events_purchased >= 3 AND recency_days <= 90 THEN 'champion'
               WHEN events_purchased >= 2 THEN 'loyal'
               WHEN first_seen >= now() - interval '45 days' THEN 'new'
               ELSE 'active'
           END,
           events_purchased::int, events_attended::int, no_shows::int,
           total_spent, recency_days
    FROM cust;
$$;

COMMENT ON FUNCTION public.organizer_customer_segments(uuid) IS
    'Per-customer RFM segment for one organizer, keyed by lowercased email. Mirrors get_organizer_customers() exactly — thresholds must be changed in both until that function is refactored onto this one.';

REVOKE EXECUTE ON FUNCTION public.organizer_customer_segments(uuid) FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- Three new criteria types.
-- ----------------------------------------------------------------------------
ALTER TABLE creator_badges DROP CONSTRAINT IF EXISTS creator_badges_criteria_type;
ALTER TABLE creator_badges ADD CONSTRAINT creator_badges_criteria_type CHECK (
    (criteria ->> 'type') = ANY (ARRAY[
        'attendance_count', 'spend_total', 'specific_event', 'checkin_count',
        'manual_grant', 'first_n_buyers', 'group_buyer', 'streak_months',
        -- v1.1
        'customer_segment', 'event_count_purchased', 'tier_purchased'
    ])
);

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
    v_tier_id  uuid;
BEGIN
    IF p_organizer_id IS NULL OR v_type IS NULL THEN
        RETURN;
    END IF;

    IF v_type = 'manual_grant' THEN
        RETURN;
    END IF;

    IF v_type = 'attendance_count' THEN
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
        SELECT ranked.em FROM ranked WHERE ranked.rn <= v_n;

    ELSIF v_type = 'group_buyer' THEN
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
            SELECT months.em AS em, months.m AS m,
                   (extract(year FROM months.m) * 12 + extract(month FROM months.m))
                     - row_number() OVER (PARTITION BY months.em ORDER BY months.m) AS island
            FROM months
            WHERE months.em IS NOT NULL AND btrim(months.em) <> ''
        )
        SELECT DISTINCT grouped.em
        FROM grouped
        GROUP BY grouped.em, grouped.island
        HAVING count(*) >= v_n;

    -- ── v1.1 ────────────────────────────────────────────────────────────────

    ELSIF v_type = 'customer_segment' THEN
        -- The same segment the organizer sees on the Customers page.
        --
        -- Segments MOVE — a champion drifts to at_risk after 120 quiet days —
        -- while badges are permanent by contract (#239). So this badge means
        -- "was a <segment> at some point", which is the right reading for a
        -- commemorative stamp and the wrong one for live access control. The
        -- builder says so in as many words.
        RETURN QUERY
        SELECT s.email
        FROM public.organizer_customer_segments(p_organizer_id) s
        WHERE s.rfm_segment IS NOT NULL
          AND s.rfm_segment = (v_params->>'segment');

    ELSIF v_type = 'event_count_purchased' THEN
        -- Attendance's purchase-side twin. Useful precisely where door scanning
        -- is patchy: buying for N events is a real signal even when nobody
        -- scanned the ticket.
        v_n := coalesce((v_params->>'n')::integer, 2);
        RETURN QUERY
        SELECT s.em
        FROM (
            SELECT coalesce(lower(us.email), lower(pi.guest_email)) AS em, pi.event_id
            FROM purchase_intents pi
            JOIN events e ON e.id = pi.event_id
            LEFT JOIN users us ON us.id = pi.user_id
            WHERE e.organizer_id = p_organizer_id
              AND pi.status = 'completed'
        ) s
        WHERE s.em IS NOT NULL AND btrim(s.em) <> ''
        GROUP BY s.em
        HAVING count(DISTINCT s.event_id) >= v_n;

    ELSIF v_type = 'tier_purchased' THEN
        -- Bought a particular ticket tier — the natural "VIP" badge. The tier is
        -- re-checked against the organizer's own events so a partner cannot
        -- author a badge against somebody else's tier id.
        v_tier_id := (v_params->>'tier_id')::uuid;
        IF v_tier_id IS NULL THEN RETURN; END IF;
        RETURN QUERY
        SELECT DISTINCT coalesce(lower(us.email), lower(t.guest_email))
        FROM tickets t
        JOIN events e ON e.id = t.event_id
        LEFT JOIN users us ON us.id = t.user_id
        WHERE e.organizer_id = p_organizer_id
          AND t.tier_id = v_tier_id
          AND t.status NOT IN ('cancelled', 'refunded')
          AND coalesce(lower(us.email), lower(t.guest_email)) IS NOT NULL;

    END IF;

    RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.creator_badge_qualifying_emails(uuid, jsonb) FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- Award on a schedule, not only when someone presses a button.
--
-- Hourly is deliberate over "every few minutes": badge eligibility changes when
-- a purchase or a check-in happens, both human-paced, and nothing downstream
-- watches for a badge in real time. The sweep is idempotent, so a missed hour
-- costs nothing.
-- ----------------------------------------------------------------------------
SELECT cron.unschedule('evaluate-creator-badges')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'evaluate-creator-badges');

SELECT cron.schedule(
    'evaluate-creator-badges',
    '17 * * * *',
    $cron$ SELECT public.evaluate_all_creator_badges(); $cron$
);
