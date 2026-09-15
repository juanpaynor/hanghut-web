-- "Abandoned checkout" segment: from lifetime to OPEN carts.
--
-- Was: anyone with >= 1 event they abandoned and never bought — ever. That
-- included carts on events that had already happened (33 of 125 on prod) and
-- people who came back and bought something else afterwards. Emailing either
-- is noise at best.
--
-- Now: a customer is "abandoned" while they have a cart on an UPCOMING event
-- they never bought, and that abandonment is newer than their last purchase
-- with this organizer. Once they buy, or the event passes, they drop out.
--
-- abandoned_count (lifetime, per-event) is kept in the customer row for the
-- table; the segment filter, the summary card and the segments[] chips use
-- the new abandoned_open. The 5-argument overload is left untouched.

CREATE OR REPLACE FUNCTION public.get_organizer_customers(p_partner_id uuid, p_segment text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_sort text DEFAULT 'recent'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_result jsonb;
BEGIN
    IF NOT (
        EXISTS (SELECT 1 FROM partners WHERE id = p_partner_id AND user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM partner_team_members WHERE partner_id = p_partner_id AND user_id = auth.uid())
    ) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    WITH org_events AS (
        SELECT id, start_datetime FROM events WHERE organizer_id = p_partner_id
    ),
    signals AS (
        SELECT lower(COALESCE(u.email, p.guest_email)) AS email,
               NULLIF(COALESCE(p.guest_name, u.display_name), '') AS name,
               p.event_id,
               CASE WHEN p.status = 'completed' THEN 'purchased' ELSE 'abandoned' END AS signal,
               COALESCE(p.paid_at, p.created_at) AS occurred_at
        FROM purchase_intents p
        JOIN org_events e ON e.id = p.event_id
        LEFT JOIN users u ON u.id = p.user_id
        WHERE COALESCE(u.email, p.guest_email) IS NOT NULL AND p.status IN ('completed','expired','failed')
        UNION ALL
        SELECT lower(COALESCE(u.email, r.guest_email)), NULLIF(COALESCE(r.guest_name, u.display_name), ''),
               r.event_id, CASE WHEN r.status='rejected' THEN 'rejected' ELSE 'registered' END, r.created_at
        FROM event_registrations r
        JOIN org_events e ON e.id = r.event_id
        LEFT JOIN users u ON u.id = r.user_id
        WHERE COALESCE(u.email, r.guest_email) IS NOT NULL
        UNION ALL
        SELECT lower(COALESCE(u.email, t.guest_email)), NULL, t.event_id,
               CASE WHEN t.status='used' OR t.checked_in_at IS NOT NULL THEN 'attended'
                    WHEN t.status='valid' AND oe.start_datetime < now() THEN 'noshow' ELSE 'has_ticket' END,
               oe.start_datetime
        FROM tickets t
        JOIN org_events oe ON oe.id = t.event_id
        LEFT JOIN users u ON u.id = t.user_id
        WHERE COALESCE(u.email, t.guest_email) IS NOT NULL AND t.status IN ('valid','used')
    ),
    -- Net revenue per customer (gross paid minus refunds), from completed orders only.
    spend AS (
        SELECT lower(COALESCE(u.email, p.guest_email)) AS email,
               sum(COALESCE(p.total_amount,0) - COALESCE(p.refunded_amount,0)) AS total_spent,
               count(*) AS orders
        FROM purchase_intents p
        JOIN org_events e ON e.id = p.event_id
        LEFT JOIN users u ON u.id = p.user_id
        WHERE p.status = 'completed' AND COALESCE(u.email, p.guest_email) IS NOT NULL
        GROUP BY 1
    ),
    per_event AS (
        SELECT email, event_id, max(name) AS name,
            bool_or(signal='purchased') AS purchased, bool_or(signal='attended') AS attended,
            bool_or(signal='noshow') AS noshow, bool_or(signal='abandoned') AS abandoned,
            bool_or(signal='rejected') AS rejected,
            bool_or(signal IN ('purchased','registered','attended')) AS positive,
            min(occurred_at) AS first_at, max(occurred_at) AS last_at,
            min(occurred_at) FILTER (WHERE signal='rejected') AS rejected_at,
            max(occurred_at) FILTER (WHERE signal IN ('purchased','registered','attended')) AS positive_at,
            max(occurred_at) FILTER (WHERE signal='abandoned') AS abandoned_at,
            max(occurred_at) FILTER (WHERE signal='purchased') AS purchased_at
        FROM signals GROUP BY email, event_id
    ),
    last_purchase AS (
        SELECT email, max(purchased_at) AS at FROM per_event GROUP BY email
    ),
    -- Open carts: upcoming event, never bought, and abandoned AFTER the
    -- customer's most recent purchase with this organizer.
    open_carts AS (
        SELECT pe.email, count(*) AS abandoned_open
        FROM per_event pe
        JOIN org_events oe ON oe.id = pe.event_id
        LEFT JOIN last_purchase lp ON lp.email = pe.email
        WHERE pe.abandoned AND NOT pe.purchased
          AND oe.start_datetime > now()
          AND pe.abandoned_at > COALESCE(lp.at, '-infinity'::timestamptz)
        GROUP BY pe.email
    ),
    cust AS (
        SELECT pe.email, max(pe.name) AS name,
            count(*) FILTER (WHERE pe.purchased) AS events_purchased,
            count(*) FILTER (WHERE pe.attended) AS events_attended,
            count(*) FILTER (WHERE pe.noshow AND NOT pe.attended) AS no_shows,
            count(*) FILTER (WHERE pe.abandoned AND NOT pe.purchased) AS abandoned_count,
            COALESCE(oc.abandoned_open, 0) AS abandoned_open,
            count(*) FILTER (WHERE pe.rejected) AS rejected_count,
            count(*) FILTER (WHERE pe.positive) AS events_engaged,
            (bool_or(pe.rejected_at IS NOT NULL) AND COALESCE(max(pe.positive_at) > min(pe.rejected_at), false)) AS reengaged,
            min(pe.first_at) AS first_seen, max(pe.last_at) AS last_activity,
            COALESCE(s.total_spent, 0)::numeric AS total_spent,
            COALESCE(s.orders, 0) AS orders,
            GREATEST(0, (current_date - max(pe.last_at)::date))::int AS recency_days
        FROM per_event pe
        LEFT JOIN spend s ON s.email = pe.email
        LEFT JOIN open_carts oc ON oc.email = pe.email
        GROUP BY pe.email, s.total_spent, s.orders, oc.abandoned_open
    ),
    scored AS (
        SELECT *,
            CASE WHEN orders > 0 THEN round(total_spent / orders, 2) ELSE 0 END AS aov,
            CASE
                WHEN events_purchased = 0 THEN NULL
                WHEN recency_days > 240 THEN 'lost'
                WHEN recency_days > 120 THEN 'at_risk'
                WHEN events_purchased >= 3 AND recency_days <= 90 THEN 'champion'
                WHEN events_purchased >= 2 THEN 'loyal'
                WHEN first_seen >= now() - interval '45 days' THEN 'new'
                ELSE 'active'
            END AS rfm_segment
        FROM cust
    ),
    filtered AS (
        SELECT * FROM scored
        WHERE (p_search IS NULL OR email ILIKE '%'||p_search||'%' OR COALESCE(name,'') ILIKE '%'||p_search||'%')
          AND (
            p_segment IS NULL
            OR (p_segment='customers'    AND events_engaged > 0)
            OR (p_segment='repeat'       AND events_engaged >= 2)
            OR (p_segment='first_timers' AND events_engaged = 1)
            OR (p_segment='no_show'      AND no_shows > 0)
            OR (p_segment='abandoned'    AND abandoned_open > 0)
            OR (p_segment='rejected'     AND rejected_count > 0)
            OR (p_segment='reengaged'    AND reengaged)
            OR (p_segment='paying'       AND events_purchased > 0)
            OR (p_segment IN ('new','active','loyal','champion','at_risk','lost') AND rfm_segment = p_segment)
          )
    )
    SELECT jsonb_build_object(
        'summary', (SELECT jsonb_build_object(
            'total_customers', count(*) FILTER (WHERE events_engaged > 0),
            'repeat',          count(*) FILTER (WHERE events_engaged >= 2),
            'first_timers',    count(*) FILTER (WHERE events_engaged = 1),
            'no_show',         count(*) FILTER (WHERE no_shows > 0),
            'abandoned',       count(*) FILTER (WHERE abandoned_open > 0),
            'rejected',        count(*) FILTER (WHERE rejected_count > 0),
            'reengaged',       count(*) FILTER (WHERE reengaged),
            'paying',          count(*) FILTER (WHERE events_purchased > 0),
            'total_revenue',   COALESCE(sum(total_spent), 0),
            'avg_ltv',         COALESCE(round(avg(total_spent) FILTER (WHERE events_purchased > 0), 2), 0),
            'aov',             COALESCE(round(sum(total_spent) / NULLIF(sum(orders), 0), 2), 0),
            'champion',        count(*) FILTER (WHERE rfm_segment='champion'),
            'loyal',           count(*) FILTER (WHERE rfm_segment='loyal'),
            'at_risk',         count(*) FILTER (WHERE rfm_segment='at_risk'),
            'lost',            count(*) FILTER (WHERE rfm_segment='lost'),
            'new',             count(*) FILTER (WHERE rfm_segment='new'),
            'active',          count(*) FILTER (WHERE rfm_segment='active')
        ) FROM scored),
        'total', (SELECT count(*) FROM filtered),
        'customers', COALESCE((SELECT jsonb_agg(row_to_json(x)) FROM (
            SELECT email, name, events_purchased, events_attended, no_shows, abandoned_count, abandoned_open,
                   rejected_count, events_engaged, reengaged, first_seen, last_activity,
                   total_spent, orders, aov, recency_days, rfm_segment,
                   (ARRAY[]::text[]
                     || CASE WHEN rfm_segment IS NOT NULL THEN ARRAY[rfm_segment] ELSE ARRAY[]::text[] END
                     || CASE WHEN events_engaged >= 2 THEN ARRAY['repeat'] ELSE ARRAY[]::text[] END
                     || CASE WHEN no_shows > 0 THEN ARRAY['no_show'] ELSE ARRAY[]::text[] END
                     || CASE WHEN abandoned_open > 0 THEN ARRAY['abandoned'] ELSE ARRAY[]::text[] END
                     || CASE WHEN rejected_count > 0 THEN ARRAY['rejected'] ELSE ARRAY[]::text[] END
                     || CASE WHEN reengaged THEN ARRAY['reengaged'] ELSE ARRAY[]::text[] END
                   ) AS segments
            FROM filtered
            ORDER BY
                CASE WHEN p_sort = 'spend' THEN total_spent END DESC NULLS LAST,
                last_activity DESC NULLS LAST
            LIMIT p_limit OFFSET p_offset
        ) x), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$function$;
