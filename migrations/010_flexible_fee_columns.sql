-- Add columns for flexible fee model
ALTER TABLE partners
ADD COLUMN IF NOT EXISTS pass_fees_to_customer BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS fixed_fee_per_ticket NUMERIC(10, 2) DEFAULT 15.00;

-- Comment on columns for clarity
COMMENT ON COLUMN partners.pass_fees_to_customer IS 'If true, platform fees (percentage + fixed) are added on top of ticket price for customer to pay.';
COMMENT ON COLUMN partners.fixed_fee_per_ticket IS 'A fixed amount (in PHP) added to the ticket price, payable by customer, collected by platform.';
