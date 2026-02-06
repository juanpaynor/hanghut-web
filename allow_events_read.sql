-- Fix: "No Active Events" in Scanner
-- This ensures Organizers can "See" their own events in the database query.

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- 1. Ensure Public can view Published events (Standard)
DROP POLICY IF EXISTS "Public can view published events" ON events;
CREATE POLICY "Public can view published events"
ON events FOR SELECT
USING ( status::text != 'draft' ); 
-- (Casting to text ensures we don't crash if 'published' isn't in your specific enum list)

-- 2. Ensure Organizers can view ALL their events (Draft, Pending, etc)
DROP POLICY IF EXISTS "Organizers can view own events" ON events;
CREATE POLICY "Organizers can view own events"
ON events FOR SELECT
TO authenticated
USING (
  -- Direct Owner
  organizer_id IN (
    SELECT id FROM partners WHERE user_id = auth.uid()
  )
  OR
  -- Team Member
  organizer_id IN (
    SELECT partner_id FROM partner_team_members WHERE user_id = auth.uid()
  )
);
