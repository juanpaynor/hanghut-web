-- 1. Check Transaction Statuses
-- We only count 'completed' transactions in the stats.
SELECT status, COUNT(*) 
FROM transactions 
GROUP BY status;

-- 2. Check Valid Partner Links
-- Do transactions actually link to existing partners?
SELECT t.partner_id, p.business_name, COUNT(t.id) as tx_count
FROM transactions t
LEFT JOIN partners p ON t.partner_id = p.id
GROUP BY t.partner_id, p.business_name;

-- 3. Test the RPC directly
-- This should return rows if the function is defined and data exists.
SELECT * FROM get_admin_partner_stats();
