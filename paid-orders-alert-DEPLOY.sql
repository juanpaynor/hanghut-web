-- ============================================================================
-- ALERT ON paid_orders_missing_tickets  ("money taken, no ticket")
-- 2026-11-15   ledger 20261115130000
-- ============================================================================
--
-- WHAT I GOT WRONG BEFORE WRITING THIS
-- ------------------------------------
-- I have been saying "nothing watches paid_orders_missing_tickets". That was
-- WRONG. public.reconcile_paid_missing_tickets() runs on cron job
-- `hanghut-reconcile-paid-tickets` EVERY 2 MINUTES and actively heals: it calls
-- issue_tickets, then book_seats_for_intent, then enqueue_order_ticket_email.
--
-- So this is NOT an unwatched failure. What is missing is an ALERT -- and the
-- thing to alert on is not "the view is non-empty".
--
-- THE REAL GAP: THE HEALER'S SCOPE IS NARROWER THAN THE DETECTOR'S
-- ----------------------------------------------------------------
-- The view asks one question: completed, paid > 0, and no valid/used ticket.
-- The healer adds FIVE conditions the view does not have:
--
--     e.status = 'active'                 -> cancelled/hidden/paused: NEVER healed
--     e.start_datetime > now()            -> event already began: NEVER healed
--     coalesce(e.is_external,false)=false -> external event:       NEVER healed
--     p.access_token IS NOT NULL          -> no token:             NEVER healed
--     LIMIT 20 per run
--
-- and it counts tickets as fulfilled when status IN ('valid','used','APPROVED')
-- while the view only accepts ('valid','used'). `approved` is a real value in
-- the ticket_status enum, so an order whose tickets are all `approved` sits in
-- the view forever while the healer considers it finished. Nobody is told.
--
-- Anything in that difference needs a HUMAN. Nothing reports it. That is the
-- hole this closes.
--
-- WHY NOT ALERT ON count(*) > 0
-- -----------------------------
-- The healer needs paid_at to be at least 2 minutes old and processes 20 per
-- run, so a healthy system legitimately shows rows for a few minutes after any
-- payment blip. Paging on a non-empty view would cry wolf during normal
-- recovery and train everyone to ignore it. This alerts on rows that are
-- (a) older than the grace period AND (b) not already reported.
--
-- PROD STATE AT WRITE TIME: exactly 1 row -- a 10.00 QRPH order from
-- 2026-06-24 on bitemates' own "Test event", which is status=cancelled, so the
-- healer skips it forever. It is pre-acknowledged below so it never pages.
--
-- RUN THIS WHOLE FILE AS ONE TRANSACTION.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- PART 1 -- alert state, so each failure is reported ONCE
-- ---------------------------------------------------------------------------
-- Without this the job either spams every 15 minutes or has to guess. One row
-- per thing-gone-wrong, keyed by a caller-supplied string.
CREATE TABLE IF NOT EXISTS public.ops_alert_log (
    alert_key     text PRIMARY KEY,
    alert_type    text        NOT NULL,
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    alerted_at    timestamptz,
    resolved_at   timestamptz,
    details       jsonb       NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.ops_alert_log IS
    'One row per distinct operational failure, so a recurring check reports each one once rather than every run. resolved_at is set when the condition clears.';

CREATE INDEX IF NOT EXISTS ops_alert_log_open_idx
    ON public.ops_alert_log (alert_type, alerted_at)
 WHERE resolved_at IS NULL;

-- This table names buyers and amounts. No RLS policies are added and RLS is
-- enabled, so PostgREST returns nothing to anon/authenticated -- only
-- service_role and postgres (which bypass RLS) can read it.
ALTER TABLE public.ops_alert_log ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- PART 2 -- the check
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_paid_orders_missing_tickets(
    p_grace_minutes integer DEFAULT 15,
    p_renag_hours   integer DEFAULT 24
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_new       integer := 0;
    v_resolved  integer := 0;
    v_rows      text    := '';
    v_total     numeric := 0;
    v_r         record;
BEGIN
    -- (1) CLOSE OUT anything previously reported that has since been fixed --
    -- by the healer, by a manual repair, or by a refund. Doing this FIRST means
    -- a flapping order does not re-nag, and the table stays an honest record of
    -- what is currently broken.
    UPDATE public.ops_alert_log l
       SET resolved_at = now()
     WHERE l.alert_type = 'paid_order_missing_tickets'
       AND l.resolved_at IS NULL
       AND NOT EXISTS (
            SELECT 1 FROM public.paid_orders_missing_tickets v
             WHERE v.intent_id::text = l.alert_key);
    v_resolved := COALESCE((SELECT count(*) FROM public.ops_alert_log
                             WHERE alert_type = 'paid_order_missing_tickets'
                               AND resolved_at > now() - interval '1 minute'), 0);

    -- (2) Collect what needs reporting: past the grace period, and either never
    -- alerted or last alerted long enough ago to deserve one nag.
    --
    -- why_skipped is the whole value of this alert. "An order has no ticket" is
    -- not actionable; "the healer will never touch this because the event is
    -- cancelled" tells you to refund instead of waiting.
    FOR v_r IN
        SELECT v.intent_id, v.paid_at, v.total_amount, v.quantity,
               v.buyer_email, v.buyer_name, v.event_title, v.payment_method,
               v.paid_after_expiry,
               CASE
                 WHEN e.status::text <> 'active'            THEN 'event is ' || e.status::text || ' -- healer skips it forever'
                 WHEN e.start_datetime <= now()             THEN 'event already started -- healer skips it forever'
                 WHEN COALESCE(e.is_external, false)        THEN 'external event -- healer skips it forever'
                 WHEN pi.access_token IS NULL               THEN 'no access_token -- healer skips it forever'
                 WHEN (SELECT count(*) FROM tickets t
                        WHERE t.purchase_intent_id = pi.id
                          AND t.status::text = 'approved') > 0
                      THEN 'tickets are status=approved -- healer counts them, the view does not'
                 ELSE 'IN HEALER SCOPE AND STILL BROKEN -- issue_tickets is failing, check the warnings'
               END AS why_skipped,
               l.alert_key IS NOT NULL AS was_alerted
          FROM public.paid_orders_missing_tickets v
          JOIN public.purchase_intents pi ON pi.id = v.intent_id
          JOIN public.events e            ON e.id  = v.event_id
          LEFT JOIN public.ops_alert_log l
                 ON l.alert_key  = v.intent_id::text
                AND l.alert_type = 'paid_order_missing_tickets'
                AND l.resolved_at IS NULL
                AND l.alerted_at  > now() - make_interval(hours => p_renag_hours)
         WHERE v.paid_at < now() - make_interval(mins => p_grace_minutes)
           AND l.alert_key IS NULL
         ORDER BY v.paid_at
         LIMIT 50
    LOOP
        v_new   := v_new + 1;
        v_total := v_total + COALESCE(v_r.total_amount, 0);

        v_rows := v_rows
            || '<tr>'
            || '<td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px">'
            ||   v_r.intent_id::text || '</td>'
            || '<td style="padding:6px 10px;border-bottom:1px solid #eee">'
            ||   COALESCE(replace(v_r.event_title, '<', '&lt;'), '?') || '</td>'
            || '<td style="padding:6px 10px;border-bottom:1px solid #eee">'
            ||   COALESCE(replace(v_r.buyer_email, '<', '&lt;'), '?') || '</td>'
            || '<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">'
            ||   to_char(COALESCE(v_r.total_amount,0), 'FM999,999,990.00') || '</td>'
            || '<td style="padding:6px 10px;border-bottom:1px solid #eee">'
            ||   to_char(v_r.paid_at AT TIME ZONE 'Asia/Manila', 'DD Mon HH24:MI') || '</td>'
            || '<td style="padding:6px 10px;border-bottom:1px solid #eee;color:#b91c1c">'
            ||   v_r.why_skipped || '</td>'
            || '</tr>';

        INSERT INTO public.ops_alert_log (alert_key, alert_type, alerted_at, details)
        VALUES (v_r.intent_id::text, 'paid_order_missing_tickets', now(),
                jsonb_build_object(
                    'paid_at',        v_r.paid_at,
                    'total_amount',   v_r.total_amount,
                    'quantity',       v_r.quantity,
                    'buyer_email',    v_r.buyer_email,
                    'event_title',    v_r.event_title,
                    'payment_method', v_r.payment_method,
                    'paid_after_expiry', v_r.paid_after_expiry,
                    'why_skipped',    v_r.why_skipped))
        ON CONFLICT (alert_key) DO UPDATE
           SET alerted_at  = now(),
               resolved_at = NULL,
               details     = EXCLUDED.details;
    END LOOP;

    IF v_new = 0 THEN
        RETURN jsonb_build_object('new', 0, 'resolved', v_resolved, 'alerted', false);
    END IF;

    -- (3) ONE email for the batch, not one per order. A burst caused by a
    -- gateway wobble must not bury the inbox it is trying to warn.
    PERFORM public.notify_internal_alert(
        'report',
        'MONEY TAKEN, NO TICKET: ' || v_new || ' order(s), '
            || to_char(v_total, 'FM999,999,990.00') || ' total',
        '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#17152f">'
        || '<p style="font-size:16px"><strong>' || v_new || ' paid order(s) have no valid ticket</strong> '
        || 'and are older than ' || p_grace_minutes || ' minutes, so the 2-minute reconciler has '
        || 'already had its chance.</p>'
        || '<table style="border-collapse:collapse;width:100%;font-size:13px">'
        || '<tr style="text-align:left;background:#f6f6fb">'
        ||   '<th style="padding:6px 10px">intent</th><th style="padding:6px 10px">event</th>'
        ||   '<th style="padding:6px 10px">buyer</th><th style="padding:6px 10px;text-align:right">amount</th>'
        ||   '<th style="padding:6px 10px">paid (MNL)</th><th style="padding:6px 10px">why it is stuck</th></tr>'
        || v_rows
        || '</table>'
        || '<p style="font-size:13px;color:#555;margin-top:18px">Each order is reported once. '
        || 'If it clears, the next run marks it resolved silently. '
        || 'Rows saying <em>IN HEALER SCOPE AND STILL BROKEN</em> are the urgent ones: '
        || 'issue_tickets is raising for them, so check the Postgres warnings.</p>'
        || '<p style="font-size:13px;color:#555">Detector: <code>paid_orders_missing_tickets</code>. '
        || 'Healer: <code>reconcile_paid_missing_tickets()</code>, cron every 2 min. '
        || 'This check: <code>check_paid_orders_missing_tickets()</code>, cron every 15 min.</p>'
        || '</div>',
        jsonb_build_object('source', 'check_paid_orders_missing_tickets',
                           'count', v_new, 'total_amount', v_total));

    RETURN jsonb_build_object('new', v_new, 'resolved', v_resolved,
                              'total_amount', v_total, 'alerted', true);
EXCEPTION WHEN OTHERS THEN
    -- A monitor must never be the thing that breaks. Cron logs the warning.
    RAISE WARNING '[check_paid_orders_missing_tickets] failed: %', SQLERRM;
    RETURN jsonb_build_object('error', SQLERRM, 'alerted', false);
END;
$function$;

-- Only the cron (postgres) and service_role. It reads buyer emails and amounts
-- and it can send mail to the whole team.
REVOKE ALL ON FUNCTION public.check_paid_orders_missing_tickets(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_paid_orders_missing_tickets(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.check_paid_orders_missing_tickets(integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_paid_orders_missing_tickets(integer, integer) TO service_role;


-- ---------------------------------------------------------------------------
-- PART 3 -- pre-acknowledge the one known stale row
-- ---------------------------------------------------------------------------
-- 10.00 QRPH, 2026-06-24, bitemates' own "Test event" (status=cancelled), paid
-- after expiry and three months BEFORE the late-payment fix shipped. Recorded
-- as already-reported so the first run does not page the team about a test
-- order from June. Deliberately NOT resolved: it is genuinely still broken, and
-- hiding it would be a lie. It will show in the open-alerts query below.
INSERT INTO public.ops_alert_log (alert_key, alert_type, alerted_at, details)
SELECT v.intent_id::text, 'paid_order_missing_tickets', now(),
       jsonb_build_object(
           'paid_at', v.paid_at, 'total_amount', v.total_amount,
           'buyer_email', v.buyer_email, 'event_title', v.event_title,
           'why_skipped', 'event is cancelled -- healer skips it forever',
           'pre_acknowledged', true,
           'note', 'Known stale test order, pre-dates the 2026-09-29 late-payment fix. Seeded by paid-orders-alert-DEPLOY.sql so it never pages.')
  FROM public.paid_orders_missing_tickets v
 WHERE v.paid_at < '2026-09-29'::timestamptz
ON CONFLICT (alert_key) DO NOTHING;


-- ---------------------------------------------------------------------------
-- PART 4 -- schedule it
-- ---------------------------------------------------------------------------
-- Every 15 minutes, offset off :00 so it does not land on the same tick as
-- expire-stale-registrations and process-email-automations (both */15).
SELECT cron.schedule(
    'check-paid-orders-missing-tickets',
    '8,23,38,53 * * * *',
    $cron$SELECT public.check_paid_orders_missing_tickets()$cron$
);


-- ---------------------------------------------------------------------------
-- PART 5 -- ledger
-- ---------------------------------------------------------------------------
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261115130000', 'paid_orders_missing_tickets_alert')
ON CONFLICT (version) DO NOTHING;

COMMIT;


-- ============================================================================
-- VERIFY  ---  run AFTER the commit
-- ============================================================================

-- V1. The job is scheduled and active.
-- EXPECT: one row, active = true
-- select jobname, schedule, command, active from cron.job
--  where jobname = 'check-paid-orders-missing-tickets';

-- V2. The stale June order is pre-acknowledged, so the first run is silent.
-- EXPECT: new = 0, alerted = false
-- select public.check_paid_orders_missing_tickets();

-- V3. Nobody but service_role can run it or read the log.
-- EXPECT: false, false, true  /  and rls_enabled = true, policies = 0
-- select has_function_privilege('anon','public.check_paid_orders_missing_tickets(integer,integer)','execute') as anon_can,
--        has_function_privilege('authenticated','public.check_paid_orders_missing_tickets(integer,integer)','execute') as authed_can,
--        has_function_privilege('service_role','public.check_paid_orders_missing_tickets(integer,integer)','execute') as service_can,
--        (select relrowsecurity from pg_class where oid='public.ops_alert_log'::regclass) as rls_enabled,
--        (select count(*) from pg_policies where tablename='ops_alert_log') as policies;

-- V4. What is currently broken, with the reason. This is the query to run when
--     an alert arrives.
-- select alert_key, details->>'event_title' as event, details->>'buyer_email' as buyer,
--        details->>'total_amount' as amount, details->>'why_skipped' as why,
--        first_seen_at, alerted_at
--   from public.ops_alert_log
--  where alert_type = 'paid_order_missing_tickets' and resolved_at is null
--  order by first_seen_at;

-- V5. END-TO-END, forces a real alert email. Run only when you want to confirm
--     the mail arrives; it reports the June test order to the whole alert list.
-- select public.check_paid_orders_missing_tickets(p_grace_minutes => 15, p_renag_hours => 0);


-- ============================================================================
-- ROLLBACK
-- ============================================================================
--   select cron.unschedule('check-paid-orders-missing-tickets');   -- stops it dead
--   drop function if exists public.check_paid_orders_missing_tickets(integer,integer);
--   drop table if exists public.ops_alert_log;
--
-- Unscheduling alone is the kill switch and needs no deploy. Nothing in this
-- file changes the healer, the view, or any money path -- it only reads them.
-- ============================================================================
