-- Fix for Admin Visibility: Break the RLS Recursion
-- We need to ensure users (including admins) can view THEIR OWN record in the 'users' table
-- so that the check (is_admin = true) can actually succeed.

-- 1. Ensure Users can view their own profile
-- This is critical strictly for the subquery (SELECT 1 FROM users WHERE id = auth.uid()...) to work.
DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile" ON users
FOR SELECT TO authenticated
USING (
  auth.uid() = id
);

-- 2. Ensure Admins can view ALL users
-- Now the subquery will work because the Admin can read their own row via rule #1.
DROP POLICY IF EXISTS "Admins can view all users" ON users;
CREATE POLICY "Admins can view all users" ON users
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
);

-- 3. Ensure Admins can view ALL partners
DROP POLICY IF EXISTS "Admins can view all partners" ON partners;
CREATE POLICY "Admins can view all partners" ON partners
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
);

-- 4. Ensure Admins can view ALL payouts
DROP POLICY IF EXISTS "Admins can view all payouts" ON payouts;
CREATE POLICY "Admins can view all payouts" ON payouts
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
);

-- 5. Ensure Admins can view ALL bank accounts
DROP POLICY IF EXISTS "Admins can view all bank accounts" ON bank_accounts;
CREATE POLICY "Admins can view all bank accounts" ON bank_accounts
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
);
