-- SECURITY: close the public ticket-mint.
--
-- THE VULNERABILITY (confirmed on production 2026-10-12)
-- `issue_tickets` is SECURITY DEFINER, is EXECUTE-granted to PUBLIC/anon/
-- authenticated, and has NO payment gate on its issuance path: its main UPDATE
-- flips every 'reserved' row for an intent to 'valid' with a real qr_code,
-- regardless of purchase_intents.status. (The `status = 'completed'` test
-- exists only inside the lapsed-reservation recovery branch.)
--
-- Chained with the equally public `reserve_tickets`, an unauthenticated caller
-- holding only the anon key can mint scannable tickets for free. Verified by
-- probe, inside a transaction that was rolled back:
--
--   called_as=anon  valid_tickets=2  qr_present=t
--   intent_status=pending  paid_at_is_null=t
--
-- THE PATCH
-- One ACL change. No function body is modified, no money-path logic is
-- touched, and no caller's code path changes. This is deliberately the
-- smallest possible production-safe fix.
--
-- CALLER VERIFICATION (why this is safe)
-- pg_stat_statements records the executing role. Over a 34-day window
-- (stats_reset 2026-09-08), calls to issue_tickets were:
--
--   service_role   1628
--   anon              0
--   authenticated     0
--
-- Both code callers construct a SERVICE ROLE client:
--   * create-purchase-intent (deployed v123, line 923) → supabaseAdmin
--   * xendit-webhook (line 713) → supabaseClient, built at line 269 with
--     SUPABASE_SERVICE_ROLE_KEY
--
-- The one DATABASE-internal caller is create_box_office_order, which is
-- SECURITY DEFINER owned by `postgres`. Its inner call is therefore privilege-
-- checked against postgres, not against the invoking role, so revoking anon
-- and authenticated cannot affect door sales.
--
-- WHAT THIS DELIBERATELY DOES **NOT** DO
-- It does NOT revoke `reserve_tickets`. That would break every purchase:
-- create-purchase-intent builds `supabaseClient` with SUPABASE_ANON_KEY plus
-- the caller's Authorization header, so reserve_tickets legitimately executes
-- as anon (guests) or authenticated (signed-in buyers) — 2,010 and 152 calls
-- respectively in the same 34-day window.
--
-- RESIDUAL RISK, ACCEPTED FOR NOW
-- anon can therefore still call reserve_tickets directly, creating purchase
-- intents and holding pool inventory for 15 minutes — an inventory-squatting /
-- nuisance vector, NOT a free-ticket mint. Closing it requires
-- create-purchase-intent to make that call through supabaseAdmin, which is an
-- edge-function change and is out of scope for a security-only patch.
--
-- ROLLBACK (instant, single statement, restores the exact prior ACL)
--   GRANT EXECUTE ON FUNCTION public.issue_tickets(uuid, uuid)
--     TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.issue_tickets(uuid, uuid) TO PUBLIC;
--
-- Prior ACL, recorded verbatim before the change:
--   {=X/postgres,postgres=X/postgres,anon=X/postgres,
--    authenticated=X/postgres,service_role=X/postgres}
--
-- POST-APPLY VERIFICATION
--   select has_function_privilege('anon','public.issue_tickets(uuid,uuid)','EXECUTE')          -- expect false
--        , has_function_privilege('authenticated','public.issue_tickets(uuid,uuid)','EXECUTE') -- expect false
--        , has_function_privilege('service_role','public.issue_tickets(uuid,uuid)','EXECUTE'); -- expect TRUE
--
-- Then smoke-test one real paid purchase end to end and confirm the ticket
-- email arrives, and one box-office door sale, before considering this done.

REVOKE EXECUTE ON FUNCTION public.issue_tickets(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.issue_tickets(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.issue_tickets(uuid, uuid) FROM authenticated;

COMMENT ON FUNCTION public.issue_tickets(uuid, uuid) IS
    'Issues tickets for a paid intent. SERVICE ROLE ONLY -- it has no payment '
    'gate of its own, so public EXECUTE is a free-ticket mint. Callers: '
    'xendit-webhook, create-purchase-intent (free/zero-total path), and '
    'create_box_office_order (SECURITY DEFINER, runs as postgres).';
