-- Fix Scanner Permissions
-- Allow Scanners (and Organizers) to READ tickets they need to scan.

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- Policy: Allow reading tickets if you are a team member of the event organizer
DROP POLICY IF EXISTS "Allow team members to view event tickets" ON tickets;

CREATE POLICY "Allow team members to view event tickets" ON tickets FOR SELECT
USING (
  event_id IN (
    SELECT id FROM events WHERE organizer_id IN (
      -- You are a team member of the organizer
      SELECT partner_id FROM partner_team_members WHERE user_id = auth.uid()
      UNION
      -- You are the organizer owner
      SELECT id FROM partners WHERE user_id = auth.uid()
    )
  )
);
