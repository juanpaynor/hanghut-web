-- Fix Partner Update RLS Policy
-- This allows logged-in users to update THEIR OWN partner record.

-- 1. Enable RLS (ensure it's on)
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;

-- 2. Create/Replace UPDATE Policy
DROP POLICY IF EXISTS "Partners can update own profile" ON partners;

CREATE POLICY "Partners can update own profile"
ON partners FOR UPDATE
TO authenticated
USING ( auth.uid() = user_id )
WITH CHECK ( auth.uid() = user_id );

-- 3. Ensure INSERT is also allowed (for registration) if not already
DROP POLICY IF EXISTS "Partners can insert own profile" ON partners;

CREATE POLICY "Partners can insert own profile"
ON partners FOR INSERT
TO authenticated
WITH CHECK ( auth.uid() = user_id );

-- 4. Ensure SELECT (Read) is allowed for owners (in addition to public read)
DROP POLICY IF EXISTS "Partners can view own profile" ON partners;

CREATE POLICY "Partners can view own profile"
ON partners FOR SELECT
TO authenticated
USING ( auth.uid() = user_id );
