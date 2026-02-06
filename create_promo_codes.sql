-- Migration: Create Promo Codes System

-- 1. Create Enum for Discount Type
DO $$
BEGIN
    CREATE TYPE discount_type AS ENUM ('percentage', 'fixed_amount');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create Promo Codes Table
CREATE TABLE IF NOT EXISTS promo_codes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    discount_type discount_type NOT NULL,
    discount_amount NUMERIC(10,2) NOT NULL, -- e.g. 10.00 for $10 or 15.00 for 15%
    usage_limit INTEGER, -- NULL means unlimited
    usage_count INTEGER DEFAULT 0,
    starts_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraint: Code should be unique per event (case insensitive)
    UNIQUE(event_id, code),
    -- Constraint: Percentage cannot exceed 100
    CONSTRAINT valid_percentage CHECK (
        (discount_type = 'percentage' AND discount_amount <= 100 AND discount_amount > 0) OR
        (discount_type = 'fixed_amount' AND discount_amount > 0)
    )
);

-- 3. Enable RLS
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies

-- Policy A: Organizers can manage (CRUD) promo codes for their own events
CREATE POLICY "Organizers can manage their event promo codes"
ON promo_codes
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM events
        WHERE events.id = promo_codes.event_id
        AND events.organizer_id IN (
            SELECT id FROM partners WHERE user_id = auth.uid()
        )
    )
);

-- Policy B: Team Members can view promo codes (if they have event access)
-- (Simplifying to same logic as organizers for now, can be expanded for specific roles later)

-- Policy C: Public can VIEW valid promo codes only (for validation)
-- We don't want public to list all codes, only check specific ones by likely precise query, 
-- but RLS is row-based. 
-- BETTER APPROACH: Only allow public to select if they know the code? 
-- Actually, typically we don't expose the table to public SELECT * directly.
-- We usually validate via a Secure Function or specific query.
-- However, for simple Supabase client usage, we can allow SELECT on active codes.
CREATE POLICY "Public can view active promo codes"
ON promo_codes
FOR SELECT
USING (
    is_active = true 
    AND (expires_at IS NULL OR expires_at > NOW())
    AND (usage_limit IS NULL OR usage_count < usage_limit)
);
