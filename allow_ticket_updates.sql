-- Allow Organizers (and Team Members) to UPDATE TICKETS (e.g. Mark as Used)

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organizers can update tickets for their events" ON tickets;

CREATE POLICY "Organizers can update tickets for their events"
ON tickets
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id = tickets.event_id
    AND (
      -- Direct Owner
      events.organizer_id = (SELECT id FROM partners WHERE user_id = auth.uid() LIMIT 1)
      OR
      -- Team Member (Fixed Role Enum)
      events.organizer_id IN (
        SELECT partner_id FROM partner_team_members 
        WHERE user_id = auth.uid() 
        AND role IN ('owner', 'manager', 'scanner') -- Replaced 'member' with 'scanner'
      )
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id = tickets.event_id
    AND (
      -- Direct Owner
      events.organizer_id = (SELECT id FROM partners WHERE user_id = auth.uid() LIMIT 1)
      OR
      -- Team Member (Fixed Role Enum)
      events.organizer_id IN (
        SELECT partner_id FROM partner_team_members 
        WHERE user_id = auth.uid() 
        AND role IN ('owner', 'manager', 'scanner')
      )
    )
  )
);
