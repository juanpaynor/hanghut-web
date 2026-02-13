-- Function to get daily sales stats for the last 30 days
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
