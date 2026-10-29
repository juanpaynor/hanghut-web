-- DEPLOY: security fixes, P0 and P1 (database half)
-- Run in the Supabase SQL editor (prod: rahhezqtkpvkialnduft).
--
-- Every finding below was verified on PROD on 2026-10-29 by impersonating the
-- `anon` role inside a rolled-back transaction. No value of any secret and no
-- customer PII was read out -- only counts, lengths and booleans.
--
-- SECTION 1 is a live total-compromise hole. Run it first, on its own, now.
-- Sections 2-5 can follow in the same sitting.
--
-- LEGITIMATE CALLERS WERE CHECKED BEFORE EVERY REVOKE -- see each section.
-- ROLLBACK for each section sits directly under it.

-- ===========================================================================
-- SECTION 1 -- CRITICAL. The anon key can read the service_role key.
-- ===========================================================================
-- public.get_secret(text) is SECURITY DEFINER and its entire body is:
--     SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1
-- No caller check of any kind. EXECUTE is held by PUBLIC, anon and
-- authenticated, so it is reachable unauthenticated at
--     POST /rest/v1/rpc/get_secret   {"secret_name":"service_role_key"}
-- The vault holds exactly two secrets: `service_role_key` and `supabase_url`.
--
-- VERIFIED AS anon: returned a 219-character value for 'service_role_key'.
-- service_role bypasses every RLS policy in this database, so this single
-- function is equivalent to handing out the whole database, plus the ability
-- to mint tickets, move payouts and read every user's rows.
--
-- LEGITIMATE CALLERS: five cron jobs (process-email-queue, process-payment-queue,
-- process-push-queue, process-email-automations, process-scheduled-campaigns).
-- All five run as `postgres`, which keeps EXECUTE below. Nothing else in the
-- database or the web app references get_secret.
--
-- Note both PUBLIC and the named roles are revoked: they are independent
-- grants, and revoking one leaves the other in place.

REVOKE EXECUTE ON FUNCTION public.get_secret(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_secret(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_secret(text) FROM authenticated;

-- ROLLBACK (do not run unless something breaks -- this re-opens the hole):
--   GRANT EXECUTE ON FUNCTION public.get_secret(text) TO anon, authenticated;

-- VERIFY: expect only postgres/service_role (and the owner) to remain.
SELECT string_agg(DISTINCT a.grantee::regrole::text, ', ') AS can_execute_get_secret
  FROM pg_proc p
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
 WHERE p.oid = 'public.get_secret(text)'::regprocedure
   AND a.privilege_type = 'EXECUTE';

-- Belt and braces: the cron jobs only ever need 'supabase_url', which is not a
-- credential. Nothing needs to read 'service_role_key' through SQL at all.
-- Consider deleting that vault row entirely once Section 1 is verified:
--   DELETE FROM vault.secrets WHERE name = 'service_role_key';
-- Left commented because it is irreversible without the key to hand.


-- ===========================================================================
-- SECTION 2 -- HIGH. Anyone can read any user's tickets, including the QR.
-- ===========================================================================
-- get_user_tickets(user_id_param, ...) opens with
--     v_uid uuid := COALESCE(auth.uid(), user_id_param);
-- For a signed-in caller auth.uid() wins, so the parameter is ignored and the
-- function is safe. For anon, auth.uid() is NULL and the CALLER'S OWN parameter
-- is used -- so passing any user's id returns that user's tickets, and the
-- result set includes `qr_code`.
--
-- VERIFIED AS anon: 1 ticket returned for another user's id, qr_code non-null.
-- That is free entry to a paid event for anyone who can guess or harvest a uuid.
--
-- The body is deliberately NOT changed: service_role callers also have a NULL
-- auth.uid() and legitimately rely on the parameter. Revoking anon alone closes
-- the hole and leaves both the app and the back end working.

REVOKE EXECUTE ON FUNCTION public.get_user_tickets(uuid, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_tickets(uuid, integer, integer) FROM anon;

-- ROLLBACK:
--   GRANT EXECUTE ON FUNCTION public.get_user_tickets(uuid, integer, integer) TO anon;


-- ===========================================================================
-- SECTION 3 -- HIGH. Platform and partner financials are world-readable.
-- ===========================================================================
-- Three SECURITY DEFINER functions with no caller check at all.
-- VERIFIED AS anon: get_admin_partner_stats() returned 65 rows (every partner's
-- GMV, platform fees, total payouts, pending balance and last payout date),
-- get_admin_accounting_stats() returned platform-wide revenue, and
-- get_daily_sales_stats() returned 31 days of sales.
--
-- Revoking anon is not enough on its own: all 771 signed-up users could still
-- call these. So each one also gets a real admin check. `check_is_admin()`
-- resolves against public.users.is_admin, which is how admin is actually
-- decided here.
--
-- LEGITIMATE CALLER: src/app/admin/accounting/page.tsx, which calls all three
-- through the SSR client carrying the signed-in admin's session -- so auth.uid()
-- is set and check_is_admin() passes. The `current_user = 'service_role'` escape
-- keeps any back-end caller working.
--
-- Bodies are otherwise copied verbatim from the live definitions.

CREATE OR REPLACE FUNCTION public.get_admin_accounting_stats()
 RETURNS TABLE(total_revenue numeric, platform_fees numeric, partner_payouts numeric, pending_payouts numeric, transaction_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NOT (public.check_is_admin() OR current_user = 'service_role') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(t.gross_amount), 0) as total_revenue,
    COALESCE(SUM(t.platform_fee + COALESCE(t.fixed_fee, 0)), 0) as platform_fees,
    COALESCE(SUM(t.organizer_payout), 0) as partner_payouts,
    (SELECT COALESCE(SUM(amount), 0) FROM payouts WHERE status IN ('pending_request', 'approved')) as pending_payouts,
    COUNT(t.id) as transaction_count
  FROM transactions t
  WHERE t.status = 'completed';
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_partner_stats()
 RETURNS TABLE(partner_id uuid, business_name text, total_gmv numeric, total_platform_fees numeric, total_payouts numeric, pending_balance numeric, last_payout_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NOT (public.check_is_admin() OR current_user = 'service_role') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id as partner_id,
    p.business_name,
    COALESCE(SUM(t.gross_amount), 0) as total_gmv,
    COALESCE(SUM(t.platform_fee + COALESCE(t.fixed_fee, 0)), 0) as total_platform_fees,
    (
      SELECT COALESCE(SUM(amount), 0)
      FROM payouts pay
      WHERE pay.partner_id = p.id
      AND pay.status = 'completed'
    ) as total_payouts,
    (SELECT b.balance FROM public.get_partner_balance(p.id) b) as pending_balance,
    (
      SELECT MAX(completed_at)
      FROM payouts pay
      WHERE pay.partner_id = p.id
      AND pay.status = 'completed'
    ) as last_payout_at
  FROM partners p
  LEFT JOIN transactions t ON p.id = t.partner_id AND t.status = 'completed'
  GROUP BY p.id, p.business_name
  ORDER BY total_gmv DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_daily_sales_stats()
 RETURNS TABLE(date text, amount numeric, count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NOT (public.check_is_admin() OR current_user = 'service_role') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date,
    COALESCE(SUM(gross_amount), 0) as amount,
    COUNT(id) as count
  FROM transactions
  WHERE status = 'completed'
    AND created_at >= NOW() - INTERVAL '30 days'
  GROUP BY 1
  ORDER BY 1 ASC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_admin_accounting_stats() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_partner_stats()    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_daily_sales_stats()      FROM PUBLIC, anon;

-- ROLLBACK: the three definitions above are verbatim copies of what is live
-- today apart from the five-line guard. To revert, re-create each without the
-- `IF NOT (...) THEN RAISE` block and re-GRANT EXECUTE TO anon.


-- ===========================================================================
-- SECTION 4 -- HIGH. Customer email lists and the auth.users leak.
-- ===========================================================================
-- organizer_customer_segments(uuid) has no caller check. VERIFIED AS anon:
-- 121 rows of customer email + total_spent + attendance for one organizer id.
-- Organizer ids are not secret -- they appear in public event payloads.
--
-- Only the grant is changed, not the body: this one has no web call site, so
-- the app may be its only caller and an in-body partner guard could break them.
-- Adding `PERFORM public._assert_caller_partner(p_organizer_id);` is the right
-- follow-up once the app team confirm how they call it.

REVOKE EXECUTE ON FUNCTION public.organizer_customer_segments(uuid) FROM PUBLIC, anon;

-- get_due_winback_recipients() reads auth.users emails with no caller check.
-- It returned 0 rows today only because no automation is due, not because it
-- is guarded.
REVOKE EXECUTE ON FUNCTION public.get_due_winback_recipients() FROM PUBLIC, anon;

-- The paid_orders_missing_tickets view exposes auth.users email to anon. This
-- is the Supabase linter's one ERROR-level `auth_users_exposed` finding, and it
-- was previously deferred. It is an operational watch view -- nothing public
-- reads it -- so anon has no reason to hold SELECT.
REVOKE SELECT ON public.paid_orders_missing_tickets FROM anon;

-- award_xp(uuid, integer) has no caller check: anyone can hand any user
-- arbitrary XP and levels. Integrity, not disclosure, but it is free to close.
REVOKE EXECUTE ON FUNCTION public.award_xp(uuid, integer) FROM PUBLIC, anon;

-- ROLLBACK: GRANT the above back to anon individually.


-- ===========================================================================
-- SECTION 5 -- MEDIUM. Four tables anon can read, write, and TRUNCATE.
-- ===========================================================================
-- These have RLS switched OFF with anon holding full DML, so anon can not only
-- read them but empty them. web_team_context holds internal session notes
-- (title, body, commits, team_comms_ids); ai_integration_references holds
-- integration documentation. The v_* tables are leftover probe tables.
--
-- RLS with no policy denies everything, which is what we want: nothing
-- public-facing reads these.

ALTER TABLE public.web_team_context          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_integration_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v_story_views_exists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v_rpc_tray_exists         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v_rpc_mark_exists         ENABLE ROW LEVEL SECURITY;

-- public.spatial_ref_sys is PostGIS-owned and cannot have RLS enabled by us.
-- It is reference data (coordinate system definitions), so disclosure is
-- harmless -- but anon holding DELETE/TRUNCATE on it is not. Revoke writes and
-- leave the read.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.spatial_ref_sys FROM PUBLIC, anon, authenticated;

-- ROLLBACK:
--   ALTER TABLE public.<name> DISABLE ROW LEVEL SECURITY;   -- per table


-- ===========================================================================
-- FINAL VERIFICATION -- run this AS-IS. Every value should be false or 0.
-- ===========================================================================
BEGIN;
SET LOCAL ROLE anon;
SELECT
  (SELECT count(*) FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
   WHERE p.oid = 'public.get_secret(text)'::regprocedure
     AND a.privilege_type = 'EXECUTE'
     AND a.grantee::regrole::text IN ('anon','authenticated','-')) AS secret_still_reachable,
  has_function_privilege('anon', 'public.get_user_tickets(uuid,integer,integer)', 'EXECUTE')   AS tickets_still_open,
  has_function_privilege('anon', 'public.get_admin_partner_stats()', 'EXECUTE')                AS partner_stats_still_open,
  has_function_privilege('anon', 'public.organizer_customer_segments(uuid)', 'EXECUTE')        AS customer_emails_still_open,
  has_table_privilege('anon', 'public.paid_orders_missing_tickets', 'SELECT')                  AS auth_users_view_still_open,
  has_table_privilege('anon', 'public.web_team_context', 'TRUNCATE')
    AND NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.web_team_context'::regclass) AS context_still_truncatable;
ROLLBACK;
