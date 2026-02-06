-- FIX RLS RECURSION WITH SECURITY DEFINER FUNCTION
-- The previous 'Admin Check' failed because checking the 'users' table 
-- inside a 'users' table policy caused an infinite loop (Recursion).
-- We fix this by moving the check into a "Security Definer" function.

-- 1. Create a secure function to check admin status
-- SECURITY DEFINER means "Run this function with the permissions of the Creator (Postgres)".
-- This bypasses RLS on the 'users' table for just this specific check, preventing the loop.
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
    AND is_admin = true
  );
END;
$$;

-- 2. Update 'users' Admin policy (The most critical one)
DROP POLICY IF EXISTS "Admins can view all users" ON users;
CREATE POLICY "Admins can view all users" ON users
FOR SELECT TO authenticated
USING (
  check_is_admin()
);

-- 3. Update 'partners' Admin policy
DROP POLICY IF EXISTS "Admins can view all partners" ON partners;
CREATE POLICY "Admins can view all partners" ON partners
FOR SELECT TO authenticated
USING (
  check_is_admin()
);

-- 4. Update 'payouts' Admin policy
DROP POLICY IF EXISTS "Admins can view all payouts" ON payouts;
CREATE POLICY "Admins can view all payouts" ON payouts
FOR SELECT TO authenticated
USING (
  check_is_admin()
);

-- 5. Update 'bank_accounts' Admin policy
DROP POLICY IF EXISTS "Admins can view all bank accounts" ON bank_accounts;
CREATE POLICY "Admins can view all bank accounts" ON bank_accounts
FOR SELECT TO authenticated
USING (
  check_is_admin()
);
