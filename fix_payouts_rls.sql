-- COMPREHENSIVE RLS FIX FOR PAYOUTS SYSTEM
-- Allow Organizers (Owners & Team Members) to:
-- 1. View their Partner record
-- 2. View Bank Accounts
-- 3. View Transactions (for balance calc)
-- 4. View & Insert Payouts
-- 5. ALLOW ADMINS TO VIEW ALL PAYOUTS (Critical for Approval)

-- 1. PARTNERS (View)
DROP POLICY IF EXISTS "Team members can view their partner" ON partners;
CREATE POLICY "Team members can view their partner" ON partners FOR SELECT TO authenticated
USING (
  id IN (SELECT partner_id FROM partner_team_members WHERE user_id = auth.uid())
  OR user_id = auth.uid()
);

-- 2. BANK ACCOUNTS (View)
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Organizers can view bank accounts" ON bank_accounts;
CREATE POLICY "Organizers can view bank accounts" ON bank_accounts FOR SELECT TO authenticated
USING (
  partner_id IN (SELECT partner_id FROM partner_team_members WHERE user_id = auth.uid())
  OR partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
);

-- 3. TRANSACTIONS (View - Critical for Balance Calc)
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Organizers can view transactions" ON transactions;
CREATE POLICY "Organizers can view transactions" ON transactions FOR SELECT TO authenticated
USING (
  partner_id IN (SELECT partner_id FROM partner_team_members WHERE user_id = auth.uid())
  OR partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
);

-- 4. PAYOUTS (View & Insert)
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

-- Policy for Organizers (View Own)
DROP POLICY IF EXISTS "Organizers can view payouts" ON payouts;
CREATE POLICY "Organizers can view payouts" ON payouts FOR SELECT TO authenticated
USING (
  partner_id IN (SELECT partner_id FROM partner_team_members WHERE user_id = auth.uid())
  OR partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
);

-- Policy for Admins (View ALL)
DROP POLICY IF EXISTS "Admins can view all payouts" ON payouts;
CREATE POLICY "Admins can view all payouts" ON payouts FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
);

-- Policy for Organizers (Insert)
DROP POLICY IF EXISTS "Organizers can request payouts" ON payouts;
CREATE POLICY "Organizers can request payouts" ON payouts FOR INSERT TO authenticated
WITH CHECK (
  partner_id IN (SELECT partner_id FROM partner_team_members WHERE user_id = auth.uid())
  OR partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
);

-- Policy for Admins (Update/Approve)
DROP POLICY IF EXISTS "Admins can update payouts" ON payouts;
CREATE POLICY "Admins can update payouts" ON payouts FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
)
WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
);
