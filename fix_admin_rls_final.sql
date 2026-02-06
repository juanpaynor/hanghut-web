-- FINAL ADMIN VISIBILITY FIX
-- The Admin Dashboard stats work (simple count) but the List fails because it joins 'partners'.
-- If Admins cannot view 'partners', the query often fails or returns empty depending on the client.

-- 1. Grant Admins access to PARTNERS
DROP POLICY IF EXISTS "Admins can view all partners" ON partners;
CREATE POLICY "Admins can view all partners" ON partners FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
);

-- 2. Grant Admins access to USERS (public profile equivalent)
-- Often 'users' table is locked down. Admin needs to see email/names.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
CREATE POLICY "Admins can view all users" ON users FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
);

-- 3. Grant Admins access to BANK ACCOUNTS
DROP POLICY IF EXISTS "Admins can view all bank accounts" ON bank_accounts;
CREATE POLICY "Admins can view all bank accounts" ON bank_accounts FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
);

-- 4. Re-Apply Payouts Admin Policy (Just to be triple sure)
DROP POLICY IF EXISTS "Admins can view all payouts" ON payouts;
CREATE POLICY "Admins can view all payouts" ON payouts FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
);
