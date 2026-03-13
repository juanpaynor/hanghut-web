-- Add phone_type column to waitlist table
-- Run in Supabase Dashboard SQL Editor

ALTER TABLE waitlist 
ADD COLUMN IF NOT EXISTS phone_type text DEFAULT NULL;

-- Optional: add a check constraint for valid values
ALTER TABLE waitlist 
ADD CONSTRAINT waitlist_phone_type_check 
CHECK (phone_type IS NULL OR phone_type IN ('android', 'iphone'));
