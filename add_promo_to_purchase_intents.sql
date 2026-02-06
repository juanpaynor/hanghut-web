-- Migration: Add Promo Code tracking to Purchase Intents
-- Checked against current schema: Matches existing tables and types.

-- 1. Add columns to store discount info
ALTER TABLE purchase_intents
ADD COLUMN IF NOT EXISTS promo_code_id UUID REFERENCES promo_codes(id),
ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10, 2) DEFAULT 0.00;

-- Note: We are NOT adding 'final_amount' because 'total_amount' should represent the final payable amount.
-- Formula: total_amount = (subtotal - discount_amount) + fees

-- 2. Comment for clarity
COMMENT ON COLUMN purchase_intents.promo_code_id IS 'The promo code applied to this purchase';
COMMENT ON COLUMN purchase_intents.discount_amount IS 'Total value stored in database currency (PHP) deducted from subtotal';
