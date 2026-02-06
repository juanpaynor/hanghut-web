-- Allow Organizers (and Team Members) to VIEW TICKETS for their events
-- This fixes the issue where only 1 ticket (the organizer's own) was showing up.

-- 1. TICKETS POLICY
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organizers can view tickets for their events" ON tickets;
CREATE POLICY "Organizers can view tickets for their events"
ON tickets
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id = tickets.event_id
    AND (
      -- Direct Owner
      events.organizer_id = (SELECT id FROM partners WHERE user_id = auth.uid() LIMIT 1)
      OR
      -- Team Member
      events.organizer_id IN (
        SELECT partner_id FROM partner_team_members 
        WHERE user_id = auth.uid()
      )
    )
  )
);

-- 2. PURCHASE INTENTS POLICY
-- (Required for the join to work and fetch price/phone)
ALTER TABLE purchase_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organizers can view purchase intents for their events" ON purchase_intents;
CREATE POLICY "Organizers can view purchase intents for their events"
ON purchase_intents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id = purchase_intents.event_id
    AND (
      -- Direct Owner
      events.organizer_id = (SELECT id FROM partners WHERE user_id = auth.uid() LIMIT 1)
      OR
      -- Team Member
      events.organizer_id IN (
        SELECT partner_id FROM partner_team_members 
        WHERE user_id = auth.uid()
      )
    )
  )
);
