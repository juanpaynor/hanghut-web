-- EMERGENCY: DISABLE RLS
-- Per request, we are disabling Row Level Security on these tables.
-- This removes all row-level access checks.
-- authenticated users (and potentially anon, depending on grants) will see all rows.

-- 1. Payouts
ALTER TABLE payouts DISABLE ROW LEVEL SECURITY;

-- 2. Partners
ALTER TABLE partners DISABLE ROW LEVEL SECURITY;

-- 3. Bank Accounts
ALTER TABLE bank_accounts DISABLE ROW LEVEL SECURITY;

-- 4. Users (Public Profile)
-- Needed because the query joins on 'users' to get email/display_name
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
