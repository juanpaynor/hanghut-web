-- Create Bank Accounts table for Organizers
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  partner_id uuid NOT NULL,
  bank_code text NOT NULL, -- e.g., 'PH_BPI', 'PH_BDO'
  bank_name text NOT NULL, -- Human readable 'BPI', 'BDO'
  account_number text NOT NULL,
  account_holder_name text NOT NULL,
  is_primary boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT bank_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT bank_accounts_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE
);

-- Add Payout Control columns to Partners table
ALTER TABLE public.partners 
ADD COLUMN IF NOT EXISTS payout_limit numeric DEFAULT 50000,
ADD COLUMN IF NOT EXISTS auto_approve_enabled boolean DEFAULT false;

-- Enable RLS on bank_accounts
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

-- Policies for Bank Accounts

-- Organizers can view their own bank accounts
CREATE POLICY "Organizers can view own bank accounts" 
ON public.bank_accounts FOR SELECT 
USING (
  partner_id IN (
    SELECT id FROM public.partners WHERE user_id = auth.uid()
    UNION
    SELECT partner_id FROM public.partner_team_members WHERE user_id = auth.uid()
  )
);

-- Organizers can insert/update their own bank accounts
CREATE POLICY "Organizers can manage own bank accounts" 
ON public.bank_accounts FOR ALL 
USING (
  partner_id IN (
    SELECT id FROM public.partners WHERE user_id = auth.uid()
    UNION
    SELECT partner_id FROM public.partner_team_members WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
  )
);

-- Admins can view all bank accounts
CREATE POLICY "Admins can view all bank accounts" 
ON public.bank_accounts FOR SELECT 
USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
);

-- Add status column update trigger for payouts if needed (assuming payouts schema is fine)
-- We might need a column for the specific bank_account_id used for a payout history, 
-- but storing snapshot (current schema) is actually SAFEST for audit trails.
-- So we won't change payouts schema structure, just how we populate it.
