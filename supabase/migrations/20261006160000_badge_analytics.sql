-- ============================================================================
-- Badge analytics: who holds a badge, what each badge is doing, and the
-- cross-badge loyal core.
--
-- The organizer page showed exactly one number per badge (holder_count) and no
-- way to see who. These three RPCs answer "who got them" and "is this badge
-- worth anything".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. organizer_customer_value -- INTERNAL helper, the single source of
--    customer-money truth.
--
-- The value logic (spend, events_purchased, recency, RFM segment) is lifted
-- VERBATIM out of get_organizer_customers so a badge holder's lifetime value
-- cannot disagree with the same person's row on the Customers page. Two
-- adjacent numbers for the same thing drifting apart is a recurring bug on this
-- platform -- events.tickets_sold vs the status RPC is open right now -- and
-- re-deriving "total spent" here is exactly how it happens again.
--
-- NOT YET REFACTORED: get_organizer_customers still carries its own inline copy
-- of this logic. Making it call this helper is the right follow-up, but it is a
-- live RPC behind the Customers page and rewriting it inside a badge-analytics
-- change is how a badge ticket causes a Customers outage. The equality is
-- verified by test instead, and that test is the thing to re-run if either
-- changes.
--
-- p_emails narrows the signal scan to named holders. Every CTE here groups by
-- email, so filtering at the signal level cannot alter any per-email aggregate
-- -- it just avoids computing the whole customer base to decorate 300 holders.
--
-- SECURITY DEFINER with NO ownership check, so it must never be callable
-- directly: EXECUTE is revoked from anon and authenticated in a follow-up
-- statement. Callers are the definer RPCs below, which check ownership first.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.organizer_customer_value(
    p_partner_id uuid,
    p_emails     text[] DEFAULT NULL
)
RETURNS TABLE (
    email            text,
    name             text,
    events_purchased integer,
    events_attended  integer,
    total_spent      numeric,
    orders           integer,
    aov              numeric,
    first_seen       timestamptz,
    last_activity    timestamptz,
    recency_days     integer,
    rfm_segment      text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
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
        WHERE COALESCE(u.email, p.guest_email) IS NOT NULL
          AND p.status IN ('completed','expired','failed')
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
    scoped AS (
        SELECT * FROM signals s
        WHERE p_emails IS NULL OR s.email = ANY(p_emails)
    ),
    spend AS (
        SELECT lower(COALESCE(u.email, p.guest_email)) AS email,
               sum(COALESCE(p.total_amount,0) - COALESCE(p.refunded_amount,0)) AS total_spent,
               count(*) AS orders
        FROM purchase_intents p
        JOIN org_events e ON e.id = p.event_id
        LEFT JOIN users u ON u.id = p.user_id
        WHERE p.status = 'completed' AND COALESCE(u.email, p.guest_email) IS NOT NULL
          AND (p_emails IS NULL OR lower(COALESCE(u.email, p.guest_email)) = ANY(p_emails))
        GROUP BY 1
    ),
    per_event AS (
        SELECT scoped.email, scoped.event_id, max(scoped.name) AS name,
            bool_or(signal='purchased') AS purchased,
            bool_or(signal='attended')  AS attended,
            min(occurred_at) AS first_at, max(occurred_at) AS last_at
        FROM scoped GROUP BY scoped.email, scoped.event_id
    ),
    cust AS (
        SELECT pe.email, max(pe.name) AS name,
            count(*) FILTER (WHERE pe.purchased)::int AS events_purchased,
            count(*) FILTER (WHERE pe.attended)::int  AS events_attended,
            min(pe.first_at) AS first_seen,
            max(pe.last_at)  AS last_activity,
            COALESCE(s.total_spent, 0)::numeric AS total_spent,
            COALESCE(s.orders, 0)::int AS orders,
            GREATEST(0, (current_date - max(pe.last_at)::date))::int AS recency_days
        FROM per_event pe
        LEFT JOIN spend s ON s.email = pe.email
        GROUP BY pe.email, s.total_spent, s.orders
    )
    SELECT c.email, c.name, c.events_purchased, c.events_attended,
           c.total_spent, c.orders,
           CASE WHEN c.orders > 0 THEN round(c.total_spent / c.orders, 2) ELSE 0 END AS aov,
           c.first_seen, c.last_activity, c.recency_days,
           -- Identical thresholds to get_organizer_customers. Do not tune one
           -- without the other.
           CASE
               WHEN c.events_purchased = 0 THEN NULL
               WHEN c.recency_days > 240 THEN 'lost'
               WHEN c.recency_days > 120 THEN 'at_risk'
               WHEN c.events_purchased >= 3 AND c.recency_days <= 90 THEN 'champion'
               WHEN c.events_purchased >= 2 THEN 'loyal'
               WHEN c.first_seen >= now() - interval '45 days' THEN 'new'
               ELSE 'active'
           END AS rfm_segment
    FROM cust c
$fn$;


-- ---------------------------------------------------------------------------
-- 2. get_badge_holders -- who holds one badge, decorated with their value.
--
-- Ownership is checked INSIDE, because SECURITY DEFINER bypasses RLS: without
-- this, a forged badge id would read somebody else's customer list. Same shape
-- as grant_creator_badge.
--
-- Paged server-side from the first version. One badge already has 306 holders
-- and this is sized for 100 partners, so there is no version of this that ships
-- returning every row to a browser.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_badge_holders(
    p_badge_id uuid,
    p_limit    integer DEFAULT 50,
    p_offset   integer DEFAULT 0,
    p_search   text    DEFAULT NULL,
    p_sort     text    DEFAULT 'recent'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
    v_organizer uuid;
    v_result    jsonb;
BEGIN
    SELECT organizer_id INTO v_organizer FROM creator_badges WHERE id = p_badge_id;
    IF v_organizer IS NULL THEN
        RAISE EXCEPTION 'Badge not found';
    END IF;
    IF NOT public.can_manage_partner(v_organizer) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    WITH holders AS (
        SELECT ucb.buyer_email AS email, ucb.earned_at, ucb.grant_type,
               (ucb.user_id IS NOT NULL) AS has_account
        FROM user_creator_badges ucb
        WHERE ucb.badge_id = p_badge_id
    ),
    -- Value is computed only for this badge's holders, not the whole base.
    val AS (
        SELECT * FROM public.organizer_customer_value(
            v_organizer, ARRAY(SELECT email FROM holders)
        )
    ),
    joined AS (
        SELECT h.email,
               COALESCE(v.name, u.display_name) AS name,
               h.earned_at, h.grant_type, h.has_account,
               COALESCE(v.events_purchased, 0) AS events_purchased,
               COALESCE(v.events_attended, 0)  AS events_attended,
               COALESCE(v.total_spent, 0)      AS total_spent,
               v.rfm_segment, v.last_activity
        FROM holders h
        LEFT JOIN val v ON v.email = h.email
        LEFT JOIN users u ON lower(u.email) = h.email
    ),
    filtered AS (
        SELECT * FROM joined
        WHERE p_search IS NULL
           OR email ILIKE '%'||p_search||'%'
           OR COALESCE(name,'') ILIKE '%'||p_search||'%'
    )
    SELECT jsonb_build_object(
        'total', (SELECT count(*) FROM filtered),
        'summary', (SELECT jsonb_build_object(
            'holders',          count(*),
            'with_account',     count(*) FILTER (WHERE has_account),
            'hand_granted',     count(*) FILTER (WHERE grant_type <> 'auto'),
            'total_spent',      COALESCE(sum(total_spent), 0),
            'avg_spent',        COALESCE(round(avg(total_spent), 2), 0),
            'champions',        count(*) FILTER (WHERE rfm_segment = 'champion'),
            'first_earned',     min(earned_at),
            'last_earned',      max(earned_at)
        ) FROM joined),
        'holders', COALESCE((SELECT jsonb_agg(row_to_json(x)) FROM (
            SELECT email, name, earned_at, grant_type, has_account,
                   events_purchased, events_attended, total_spent, rfm_segment, last_activity
            FROM filtered
            ORDER BY
                CASE WHEN p_sort = 'spend' THEN total_spent END DESC NULLS LAST,
                CASE WHEN p_sort = 'name'  THEN COALESCE(name, email) END ASC NULLS LAST,
                earned_at DESC
            LIMIT p_limit OFFSET p_offset
        ) x), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$fn$;


-- ---------------------------------------------------------------------------
-- 3. get_badge_analytics -- one grouped pass over every badge a partner owns.
--
-- Deliberately NOT a per-badge loop: badges x holders is the shape that becomes
-- the wall, and the same lesson already applies to the award engine.
--
-- `visible` / `pct_visible` is the number worth surfacing most. Badges are
-- keyed on email, and platform-wide only 9% of awards are attached to an
-- account today -- so a badge with 306 holders may be invisible to 280 of them.
-- An organizer deciding whether badges are worth their time should see that,
-- not just the holder count.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_badge_analytics(p_organizer_id uuid)
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

    WITH my_badges AS (
        SELECT id, name, tier, is_active, created_at, first_evaluated_at
        FROM creator_badges WHERE organizer_id = p_organizer_id
    ),
    per_badge AS (
        SELECT b.id, b.name, b.tier, b.is_active, b.created_at, b.first_evaluated_at,
               count(u.id)::int                                          AS holders,
               count(u.user_id)::int                                     AS visible,
               count(*) FILTER (WHERE u.grant_type <> 'auto')::int        AS hand_granted,
               count(*) FILTER (WHERE u.earned_at > now() - interval '30 days')::int AS earned_30d,
               min(u.earned_at) AS first_earned,
               max(u.earned_at) AS last_earned
        FROM my_badges b
        LEFT JOIN user_creator_badges u ON u.badge_id = b.id
        GROUP BY b.id, b.name, b.tier, b.is_active, b.created_at, b.first_evaluated_at
    ),
    -- 12-week earn curve for every badge in one pass.
    weekly AS (
        SELECT u.badge_id,
               date_trunc('week', u.earned_at)::date AS week,
               count(*)::int AS awards
        FROM user_creator_badges u
        JOIN my_badges b ON b.id = u.badge_id
        WHERE u.earned_at > now() - interval '12 weeks'
        GROUP BY 1, 2
    )
    SELECT jsonb_build_object(
        'totals', (SELECT jsonb_build_object(
            'badges',          count(*),
            'active',          count(*) FILTER (WHERE is_active),
            'awards',          COALESCE(sum(holders), 0),
            'visible',         COALESCE(sum(visible), 0),
            'pct_visible',     CASE WHEN COALESCE(sum(holders),0) = 0 THEN 0
                                    ELSE round(100.0 * sum(visible) / sum(holders), 1) END,
            'awards_30d',      COALESCE(sum(earned_30d), 0),
            'distinct_holders',(SELECT count(DISTINCT u.buyer_email)
                                  FROM user_creator_badges u
                                  JOIN my_badges b ON b.id = u.badge_id)
        ) FROM per_badge),
        'badges', COALESCE((SELECT jsonb_agg(row_to_json(x) ORDER BY x.holders DESC) FROM (
            SELECT pb.id, pb.name, pb.tier, pb.is_active, pb.holders, pb.visible,
                   pb.hand_granted, pb.earned_30d, pb.first_earned, pb.last_earned,
                   CASE WHEN pb.holders = 0 THEN 0
                        ELSE round(100.0 * pb.visible / pb.holders, 1) END AS pct_visible,
                   -- NULL first_evaluated_at means the retroactive sweep has not
                   -- run yet, so this badge has never notified anyone.
                   (pb.first_evaluated_at IS NOT NULL) AS swept,
                   COALESCE((SELECT jsonb_agg(jsonb_build_object('week', w.week, 'awards', w.awards)
                                              ORDER BY w.week)
                               FROM weekly w WHERE w.badge_id = pb.id), '[]'::jsonb) AS curve
            FROM per_badge pb
        ) x), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$fn$;


-- ---------------------------------------------------------------------------
-- 4. get_badge_loyal_core -- the people holding MORE THAN ONE of your badges.
--
-- This is the loyalty signal a single badge cannot give. Holding one badge can
-- mean one purchase; holding three means someone kept coming back across
-- different criteria. Ranked by badge count, then money.
--
-- p_min_badges defaults to 2 because that is the whole point, but it is a
-- parameter so a partner with many badges can ask for their 3+ core.
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
            ORDER BY badge_count DESC, total_spent DESC, latest_earned DESC
            LIMIT p_limit OFFSET p_offset
        ) x), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$fn$;


-- ---------------------------------------------------------------------------
-- 5. Grants.
--
-- New functions in `public` get EXECUTE for PUBLIC plus anon and authenticated
-- by default on this project, so every one of these has to be closed explicitly
-- -- the same trap as new TABLES getting ALL granted to anon.
--
-- organizer_customer_value is the one that matters: it has no ownership check by
-- design, so as created it let anon read any partner's customer spend by
-- guessing a partner id. service_role only. The definer RPCs below call it as
-- the function owner, so they are unaffected.
--
-- Applied separately from the CREATEs above, because apply_migration refuses a
-- migration containing REVOKE.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.organizer_customer_value(uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.organizer_customer_value(uuid, text[]) TO service_role;

REVOKE ALL ON FUNCTION public.get_badge_holders(uuid, integer, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_badge_holders(uuid, integer, integer, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_badge_analytics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_badge_analytics(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_badge_loyal_core(uuid, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_badge_loyal_core(uuid, integer, integer, integer) TO authenticated, service_role;
