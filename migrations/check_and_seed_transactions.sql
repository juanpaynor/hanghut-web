-- 1. Check if there are any transactions
SELECT COUNT(*) as transaction_count FROM transactions;

-- 2. Check if there are any partners
SELECT COUNT(*) as partner_count FROM partners;

-- 3. (Optional) Insert a Test Partner if none exist
-- UNCOMMENT TO RUN

INSERT INTO users (id, email, display_name, created_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'testpartner@hanghut.com', 'Test Partner User', NOW())
ON CONFLICT (email) DO NOTHING;

INSERT INTO partners (id, user_id, business_name, status, created_at)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 
   (SELECT id FROM users WHERE email = 'testpartner@hanghut.com'), 
   'Test Partner Business', 
   'approved', 
   NOW())
ON CONFLICT DO NOTHING;


-- 4. (Optional) Insert Test Transactions for an existing partner
-- Replace 'PARTNER_ID_HERE' with a real partner ID found from query 2
/*
INSERT INTO events (id, organizer_id, title, latitude, longitude, start_datetime, capacity, ticket_price)
VALUES 
   ('00000000-0000-0000-0000-000000000002', 'PARTNER_ID_HERE', 'Test Event', 0, 0, NOW(), 100, 1000)
ON CONFLICT DO NOTHING;

INSERT INTO transactions (partner_id, event_id, user_id, gross_amount, platform_fee, payment_processing_fee, organizer_payout, fee_percentage, status, created_at)
VALUES 
  ('PARTNER_ID_HERE', '00000000-0000-0000-0000-000000000002', 'PARTNER_ID_HERE', 1000, 40, 30, 930, 4, 'completed', NOW() - INTERVAL '1 day'),
  ('PARTNER_ID_HERE', '00000000-0000-0000-0000-000000000002', 'PARTNER_ID_HERE', 2000, 80, 60, 1860, 4, 'completed', NOW() - INTERVAL '2 days');
*/
