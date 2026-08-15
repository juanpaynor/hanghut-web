-- Phase 2a: the AGGREGATE obligation across main-wallet partners, and pointing the
-- first reader (admin partner stats) at the canonical balance.
--
-- WHY THE AGGREGATE MATTERS (and per-partner correctness does not cover it):
-- Every main-wallet partner is paid out of ONE Xendit account. If partner A withdraws
-- their full correct balance, the disbursement can still succeed using cash that belongs
-- to partner B — to Xendit it is one account and one legitimate transfer. Nothing errors.
-- Per-partner balances are all individually right, and the platform is still insolvent.
-- Only `master balance - SUM(obligations)` detects it.

-- ---------------------------------------------------------------------------
-- Total owed to every partner settling into the HangHut main wallet.
-- The Xendit master balance is NOT available here (no HTTP from SQL) — the caller
-- supplies it, so the same function serves the payout guard and the admin page.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_main_wallet_obligations()
 RETURNS TABLE(
    partner_count integer,
    total_obligation numeric,
    largest_partner_id uuid,
    largest_partner_name text,
    largest_obligation numeric
 )
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    WITH owed AS (
        SELECT pa.id, pa.business_name, b.balance
          FROM partners pa
          CROSS JOIN LATERAL public.get_partner_balance(pa.id) b
         WHERE pa.use_main_wallet IS TRUE
           -- A negative balance is an overdrawn partner, not money we hold for them.
           -- Clamping at 0 keeps one bad account from masking real obligations.
           AND b.balance > 0
    )
    SELECT (SELECT count(*)::int FROM owed),
           coalesce((SELECT sum(balance) FROM owed), 0),
           (SELECT id FROM owed ORDER BY balance DESC LIMIT 1),
           (SELECT business_name FROM owed ORDER BY balance DESC LIMIT 1),
           coalesce((SELECT max(balance) FROM owed), 0);
$function$;

-- ---------------------------------------------------------------------------
-- Reader 1 of 3: admin partner stats. Display only — no money moves on this.
-- Identical to the previous definition except pending_balance, which stopped using
-- the `status='completed' AND payout_id IS NULL` predicate (blind to refund rows,
-- and wrong whenever payout linking fails or a rejected payout keeps its links).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_partner_stats()
 RETURNS TABLE(partner_id uuid, business_name text, total_gmv numeric, total_platform_fees numeric, total_payouts numeric, pending_balance numeric, last_payout_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
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

    -- Canonical: signed sum across all streams, minus payouts by status.
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

REVOKE ALL ON FUNCTION public.get_main_wallet_obligations() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_main_wallet_obligations() TO authenticated;
