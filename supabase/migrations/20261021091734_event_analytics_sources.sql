-- Traffic sources on the event Analytics tab.
--
-- The attribution has been collected since 2026-07-23 and shown to nobody:
-- 76,988 of 77,160 interactions in the last 90 days carry a channel, and
-- get_event_analytics never once referenced the column. Back to the Garden has
-- 42,826 visitors in a single bucket the organizer cannot see, let alone break
-- down.
--
-- This adds one key, `sources`. Everything else about the function is
-- unchanged, so the existing funnel keeps rendering exactly as it does now.
--
-- SCOPE: all time, deliberately. It sits directly under `funnel`, which is also
-- all time, and two adjacent tables on one screen that silently cover different
-- periods is how an organizer ends up mistrusting both. `daily` keeps its
-- p_days window because a chart over time is a different question.
--
-- THE TWO COLUMNS DO NOT RECONCILE, AND THAT IS NOT A BUG. `visitors` and
-- `checkouts` come from browser events, which ad blockers and the consent gate
-- drop; `orders` and `revenue` come from purchase_intents, which is complete.
-- That is the same gap the `abandoned` comment below already documents, where
-- 469 buyers were recorded against 403 browsers reaching checkout. So this
-- returns the raw counts and NO conversion rate: a percentage computed across
-- those two sources can exceed 100 and, on at least one live event, would.
-- The `app` channel shows it plainly -- 87 checkouts, 0 orders -- because app
-- purchases do not write attribution. Surfacing that is more useful than
-- hiding it behind a ratio.

-- ---------------------------------------------------------------------------
-- 0. Resolve an acquisition source from what was actually recorded.
-- ---------------------------------------------------------------------------
-- The `channel` column cannot be trusted on its own: the old deriveChannel
-- never looked at the referrer, so on Back to the Garden it filed 50,829 views
-- as 'direct' -- and 33,863 of those carry a referrer, 28,734 of them Facebook.
-- Grouping by `channel` would therefore show one enormous "Direct" row and no
-- social breakdown at all, which is exactly the complaint this is answering.
--
-- Deriving instead means three months of already-collected history resolves
-- correctly the moment this ships, rather than only new traffic. The order
-- mirrors the TypeScript tracker so a row recorded today and a row recorded in
-- July land in the same bucket.
CREATE OR REPLACE FUNCTION public.attribution_source(
    p_channel  text,
    p_utm      text,
    p_referrer text
) RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $fn$
WITH n AS (
    SELECT lower(nullif(trim(p_utm), ''))  AS utm,
           lower(split_part(split_part(coalesce(p_referrer, ''), '//', 2), '/', 1)) AS host,
           lower(nullif(trim(p_channel), '')) AS ch
)
SELECT CASE
    -- 1. The organizer tagged the link. Same alias table as the TS tracker,
    --    because 814 intents carried utm_source=ig and were filed as direct.
    WHEN n.utm IN ('ig','insta','instagram')              THEN 'instagram'
    WHEN n.utm IN ('fb','facebook','meta','messenger')    THEN 'facebook'
    WHEN n.utm IN ('tt','tiktok')                         THEN 'tiktok'
    WHEN n.utm IN ('x','twitter')                         THEN 'twitter'
    WHEN n.utm IN ('yt','youtube')                        THEN 'youtube'
    WHEN n.utm IN ('email','newsletter')                  THEN 'email'
    WHEN n.utm IS NOT NULL                                THEN n.utm

    -- 2. The referrer host, matched on the HOST only -- `ilike '%facebook%'`
    --    would also claim notfacebook.example.
    WHEN n.host ~ '(^|\.)instagram\.com$'                 THEN 'instagram'
    WHEN n.host ~ '(^|\.)(facebook|messenger)\.com$'
      OR n.host IN ('fb.me','fb.com')                     THEN 'facebook'
    WHEN n.host ~ '(^|\.)tiktok\.com$'                    THEN 'tiktok'
    WHEN n.host ~ '(^|\.)(twitter|x)\.com$'
      OR n.host = 't.co'                                  THEN 'twitter'
    WHEN n.host ~ '(^|\.)youtube\.com$'
      OR n.host = 'youtu.be'                              THEN 'youtube'
    WHEN n.host ~ '(^|\.)google\.'                        THEN 'google'
    WHEN n.host ~ '(^|\.)(bing|duckduckgo|yahoo)\.'       THEN 'search'
    WHEN n.host ~ '(^|\.)(linktr\.ee|lnk\.bio|bio\.link|beacons\.ai|taplink\.cc)$'
                                                          THEN 'link_in_bio'

    -- 3. Fall back to the recorded channel, but only where it carries real
    --    information: 'direct' means "we did not know", not "typed it in".
    --    This is what keeps storefront / embed / app / landing intact.
    WHEN n.ch IS NOT NULL AND n.ch NOT IN ('direct','unknown') THEN n.ch

    ELSE 'direct'
END
FROM n;
$fn$;

REVOKE ALL ON FUNCTION public.attribution_source(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attribution_source(text, text, text)
    TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_event_analytics(p_event_id uuid, p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_since timestamptz := now() - make_interval(days => p_days);
  v_result jsonb;
BEGIN
  SELECT organizer_id INTO v_org FROM events WHERE id = p_event_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF NOT (
    EXISTS (SELECT 1 FROM partners WHERE id = v_org AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM partner_team_members WHERE partner_id = v_org AND user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT jsonb_build_object(
    'totals', COALESCE((
      SELECT jsonb_object_agg(type, cnt)
      FROM (SELECT type, count(*) AS cnt FROM event_interactions WHERE event_id = p_event_id GROUP BY type) t
    ), '{}'::jsonb),
    'unique_views', (
      SELECT count(DISTINCT COALESCE(session_id, user_id::text))
      FROM event_interactions WHERE event_id = p_event_id AND type = 'view'
    ),
    'daily', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', d, 'views', views, 'get_tickets', gt) ORDER BY d)
      FROM (
        SELECT date_trunc('day', created_at)::date AS d,
               count(*) FILTER (WHERE type = 'view')        AS views,
               count(*) FILTER (WHERE type = 'get_tickets') AS gt
        FROM event_interactions
        WHERE event_id = p_event_id AND created_at >= v_since
        GROUP BY 1
      ) s
    ), '[]'::jsonb),
    'funnel', jsonb_build_object(
      'views',            (SELECT count(*) FROM event_interactions WHERE event_id = p_event_id AND type = 'view'),
      'get_tickets',      (SELECT count(*) FROM event_interactions WHERE event_id = p_event_id AND type = 'get_tickets'),
      'checkout_started', (SELECT count(*) FROM event_interactions WHERE event_id = p_event_id AND type = 'checkout_started'),
      'purchased',        (SELECT count(*) FROM purchase_intents   WHERE event_id = p_event_id AND status = 'completed'),
      -- Orders that were created and never paid. Counted here, from the SAME
      -- table as `purchased`, precisely so the two can be compared: the three
      -- steps above come from browser events (ad blockers and the consent gate
      -- drop some), which is why subtracting `purchased` from
      -- `checkout_started` produces nonsense -- on one live event that sum went
      -- negative, 469 distinct buyers against 403 browsers recorded reaching
      -- checkout. `abandoned` has no such gap.
      'abandoned',        (SELECT count(*) FROM purchase_intents   WHERE event_id = p_event_id AND status IN ('expired', 'failed'))
    ),
    -- NEW. Ordered by revenue, because "which channel made money" is the
    -- question an organizer actually has; visitors breaks the ties so a channel
    -- with traffic and no sales still appears rather than vanishing.
    'sources', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'channel',   ch,
               'visitors',  visitors,
               'checkouts', checkouts,
               'orders',    orders,
               'revenue',   revenue
             ) ORDER BY revenue DESC, visitors DESC)
      FROM (
        SELECT COALESCE(v.ch, p.ch)        AS ch,
               COALESCE(v.visitors, 0)     AS visitors,
               COALESCE(v.checkouts, 0)    AS checkouts,
               COALESCE(p.orders, 0)       AS orders,
               COALESCE(p.revenue, 0)      AS revenue
        FROM (
          SELECT attribution_source(channel, utm_source, referrer) AS ch,
                 count(DISTINCT COALESCE(session_id, user_id::text))
                   FILTER (WHERE type = 'view')             AS visitors,
                 count(*) FILTER (WHERE type = 'checkout_started') AS checkouts
          FROM event_interactions
          WHERE event_id = p_event_id
          GROUP BY 1
        ) v
        -- FULL JOIN: a channel can have orders and no recorded visitors (the
        -- app, and anyone whose browser events were blocked) or visitors and no
        -- orders. Dropping either side would quietly delete real revenue from
        -- the organizer's report.
        FULL JOIN (
          SELECT attribution_source(
                   attribution->>'channel',
                   attribution->>'utm_source',
                   attribution->>'referrer'
                 ) AS ch,
                 count(*) FILTER (WHERE status = 'completed') AS orders,
                 COALESCE(sum(total_amount) FILTER (WHERE status = 'completed'), 0)::numeric AS revenue
          FROM purchase_intents
          WHERE event_id = p_event_id
          GROUP BY 1
        ) p ON p.ch = v.ch
      ) s
      -- Drop rows that say nothing. A typo'd link (one real case: a single
      -- utm_source=an on Sinadya Run) otherwise earns its own row of dashes,
      -- and on that event three of eight rows would have been empty -- which
      -- reads as a broken feature on the first screen an organizer ever sees.
      -- A source with traffic and NO sales is kept: "Facebook sent 37,264
      -- visitors and 62 orders" is the whole point.
      WHERE s.visitors > 0 OR s.orders > 0
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
