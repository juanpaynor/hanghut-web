-- Phase 1 of the ledger rework: ONE canonical definition of "what a partner is owed".
--
-- READ-ONLY. Adds functions only. Changes no behaviour, no data, no existing code path.
-- Its job is to make disagreement VISIBLE before we touch any money path.
--
-- WHY THIS EXISTS
-- "Balance" is currently re-implemented in at least three places (request-payout, the
-- organizer payouts page, get_admin_partner_stats), each with its own filters. The one in
-- request-payout reads:
--       status = 'completed' AND payout_id IS NULL
-- Refund rows are inserted with status = 'refunded', so a reversing entry is written,
-- shown in history, and then SILENTLY EXCLUDED from the number that authorises
-- withdrawals. Both refund paths are affected. Today no refund row has ever been written
-- and no payout has ever completed, so nothing has drifted yet — this lands the correct
-- definition before the first one does.
--
-- THE RULE: status describes WHAT HAPPENED; the SIGN of the amount carries THE MONEY.
-- Never filter a balance by a status whitelist.

-- ---------------------------------------------------------------------------
-- Canonical balance for a single partner, across all three revenue streams.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_partner_balance(p_partner_id uuid)
 RETURNS TABLE(
    partner_id uuid,
    events_earned numeric,
    experiences_earned numeric,
    merch_earned numeric,
    lifetime_earned numeric,
    paid_out numeric,
    balance numeric
 )
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    WITH ev AS (
        -- 'completed' and 'refunded' both moved real money (refunds are negative rows).
        -- 'pending' and 'failed' moved none.
        SELECT coalesce(sum(t.organizer_payout), 0) AS amt
          FROM transactions t
         WHERE t.partner_id = p_partner_id
           AND t.status IN ('completed', 'refunded')
    ),
    ex AS (
        SELECT coalesce(sum(et.host_payout), 0) AS amt
          FROM experience_transactions et
         WHERE et.partner_id = p_partner_id
           AND et.status IN ('completed', 'refunded')
    ),
    me AS (
        SELECT coalesce(sum(mt.organizer_payout), 0) AS amt
          FROM merch_transactions mt
         WHERE mt.organizer_id = p_partner_id
           AND mt.status IN ('completed', 'refunded')
    ),
    po AS (
        -- Money already gone, or committed and therefore unavailable. Excludes
        -- failed / rejected / cancelled, which release the funds again.
        SELECT coalesce(sum(p.amount), 0) AS amt
          FROM payouts p
         WHERE p.partner_id = p_partner_id
           AND p.status IN ('pending_request', 'approved', 'processing', 'completed')
    )
    SELECT p_partner_id,
           ev.amt, ex.amt, me.amt,
           (ev.amt + ex.amt + me.amt) AS lifetime_earned,
           po.amt AS paid_out,
           (ev.amt + ex.amt + me.amt - po.amt) AS balance
      FROM ev, ex, me, po;
$function$;

-- ---------------------------------------------------------------------------
-- Reconciliation: canonical balance vs what request-payout computes TODAY.
-- Any non-zero delta is a surface that would authorise the wrong amount.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_partner_balance_reconciliation()
 RETURNS TABLE(
    partner_id uuid,
    business_name text,
    use_main_wallet boolean,
    canonical_balance numeric,
    legacy_balance numeric,
    delta numeric,
    refund_rows_ignored_by_legacy bigint
 )
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT pa.id,
           pa.business_name,
           coalesce(pa.use_main_wallet, false),
           b.balance AS canonical_balance,
           -- Exactly the predicate request-payout uses for the ledger branch.
           coalesce((
             SELECT sum(t.organizer_payout) FROM transactions t
              WHERE t.partner_id = pa.id AND t.status = 'completed' AND t.payout_id IS NULL
           ), 0) AS legacy_balance,
           b.balance - coalesce((
             SELECT sum(t.organizer_payout) FROM transactions t
              WHERE t.partner_id = pa.id AND t.status = 'completed' AND t.payout_id IS NULL
           ), 0) AS delta,
           (SELECT count(*) FROM transactions t
             WHERE t.partner_id = pa.id AND t.status = 'refunded') AS refund_rows_ignored_by_legacy
      FROM partners pa
      CROSS JOIN LATERAL public.get_partner_balance(pa.id) b;
$function$;

REVOKE ALL ON FUNCTION public.get_partner_balance(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_partner_balance_reconciliation() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_partner_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_partner_balance_reconciliation() TO authenticated;
