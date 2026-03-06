-- Add auto_approve_payouts flag to partners table
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS auto_approve_payouts BOOLEAN DEFAULT false;

-- Add description comment
COMMENT ON COLUMN public.partners.auto_approve_payouts IS 'If true, payout requests from this partner bypass manual admin review and are disbursed automatically via Xendit';
