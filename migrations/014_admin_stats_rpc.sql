-- Function to get admin accounting stats efficiently
CREATE OR REPLACE FUNCTION get_admin_accounting_stats()
RETURNS TABLE (
  total_revenue NUMERIC,
  platform_fees NUMERIC,
  partner_payouts NUMERIC,
  pending_payouts NUMERIC,
  transaction_count BIGINT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- Total Revenue (Gross Transaction Volume)
    COALESCE(SUM(t.gross_amount), 0) as total_revenue,
    
    -- Platform Fees (Platform Fee + Fixed Fee)
    -- Assuming fixed_fee is also platform revenue
    COALESCE(SUM(t.platform_fee + COALESCE(t.fixed_fee, 0)), 0) as platform_fees,
    
    -- Partner Payouts (Processed)
    COALESCE(SUM(t.organizer_payout), 0) as partner_payouts,
    
    -- Pending Payouts (from payouts table)
    (SELECT COALESCE(SUM(amount), 0) FROM payouts WHERE status IN ('pending_request', 'approved')) as pending_payouts,
    
    -- Transaction Count
    COUNT(t.id) as transaction_count
  FROM transactions t
  WHERE t.status = 'completed';
END;
$$;
