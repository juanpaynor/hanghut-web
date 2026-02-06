-- Debug: Find why no events are showing in Scanner
-- Run this in Supabase SQL Editor

-- 1. Get the Current User's ID (Replace with specific user UUID if running manually, or check auth.uid())
-- SELECT auth.uid(); 

-- 2. Check Partners linked to this user
SELECT * FROM partners WHERE user_id = auth.uid();

-- 3. Check Team Memberships
SELECT * FROM partner_team_members WHERE user_id = auth.uid();

-- 4. Check Events for these partners
-- Replace 'PARTNER_ID_FROM_ABOVE' with the actual ID found in Step 2 or 3.
/*
SELECT * FROM events 
WHERE organizer_id = (SELECT id FROM partners WHERE user_id = auth.uid() LIMIT 1)
OR organizer_id IN (SELECT partner_id FROM partner_team_members WHERE user_id = auth.uid());
*/
