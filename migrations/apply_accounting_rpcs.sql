-- 1. Function to get daily sales stats for the last 30 days
CREATE OR REPLACE FUNCTION get_daily_sales_stats()
RETURNS TABLE (
  date TEXT,
  amount NUMERIC,
  count BIGINT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
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
$$;

-- 2. Function to get partner revenue stats
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
    
    -- Total GMV
    COALESCE(SUM(t.gross_amount), 0) as total_gmv,
    
    -- Total Platform Fees
    COALESCE(SUM(t.platform_fee + COALESCE(t.fixed_fee, 0)), 0) as total_platform_fees,
    
    -- Total Payouts (from payouts table)
    (
      SELECT COALESCE(SUM(amount), 0)
      FROM payouts pay
      WHERE pay.partner_id = p.id
      AND pay.status = 'completed'
    ) as total_payouts,
    
    -- Pending Balance
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_daily_sales_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_sales_stats() TO service_role;
GRANT EXECUTE ON FUNCTION get_admin_partner_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_partner_stats() TO service_role;
