-- Function to get admin partner stats efficiently
CREATE OR REPLACE FUNCTION get_admin_partner_stats()
RETURNS TABLE (
  partner_id UUID,
  business_name TEXT,
  total_gmv NUMERIC,
  total_platform_fees NUMERIC,
  total_payouts NUMERIC,
  pending_balance NUMERIC,
  last_payout_at TIMESTAMP WITH TIME ZONE
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id as partner_id,
    p.business_name,
    
    -- Total GMV (Gross Transaction Volume)
    COALESCE(SUM(t.gross_amount), 0) as total_gmv,
    
    -- Total Platform Fees (Platform Fee + Fixed Fee)
    COALESCE(SUM(t.platform_fee + COALESCE(t.fixed_fee, 0)), 0) as total_platform_fees,
    
    -- Total Payouts (Paid)
    -- We can sum from payouts table directly for accuracy or use transaction summation.
    -- Using payouts table is better for "what was actually paid out".
    (
      SELECT COALESCE(SUM(amount), 0)
      FROM payouts pay
      WHERE pay.partner_id = p.id
      AND pay.status = 'completed'
    ) as total_payouts,
    
    -- Pending Balance (Completed transactions not yet in a payout)
    (
      SELECT COALESCE(SUM(organizer_payout), 0)
      FROM transactions t2
      WHERE t2.partner_id = p.id
      AND t2.status = 'completed'
      AND t2.payout_id IS NULL
    ) as pending_balance,
    
    -- Last Payout Date
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
$$;

-- Grant execute permission to authenticated users (RLS will be handled by app logic/admin check usually, 
-- but explicit grant is needed for RPC)
GRANT EXECUTE ON FUNCTION get_admin_partner_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_partner_stats() TO service_role;
