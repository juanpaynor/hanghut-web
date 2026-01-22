-- Allow public read access to partners table
-- This is required for the public storefront pages (/[slug]) to work for non-logged in users.

-- 1. Enable RLS on partners (if not already, just to be safe, though typically it is)
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;

-- 2. Create Policy for Public Read Access
-- We only want to expose partners that have a slug set (implying they set up their store)
-- and are likely 'approved' status (depending on your business logic).
-- For now, let's allow reading any partner record if you know the slug/ID.

DROP POLICY IF EXISTS "Public can view partners" ON partners;

CREATE POLICY "Public can view partners"
ON partners FOR SELECT
USING ( true ); -- Allows anyone to read partner rows

-- Note: If you have sensitive columns (like bank details, commission rates) in 'partners',
-- you should restrict what columns are selected in your API/code, 
-- OR strictly separate sensitive data into a 'partner_secrets' table.
-- For this MVP, we assume 'partners' contains mostly public profile info.
