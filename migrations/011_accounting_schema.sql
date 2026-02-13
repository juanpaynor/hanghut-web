-- Add missing accounting columns to transactions table
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS fixed_fee NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS payout_id UUID REFERENCES payouts(id);

-- Comment on columns for clarity
COMMENT ON COLUMN transactions.fixed_fee IS 'The fixed fee amount (customer paid fee) related to the transaction.';
COMMENT ON COLUMN transactions.payout_id IS 'The payout request that includes this transaction.';

-- Create index for faster payout lookups
CREATE INDEX IF NOT EXISTS idx_transactions_payout_id ON transactions(payout_id);
