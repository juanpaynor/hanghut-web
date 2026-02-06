-- Enable Subscriber Management
-- This allows Organizers to manually add/remove email subscribers.

ALTER TABLE partner_subscribers ENABLE ROW LEVEL SECURITY;

-- 1. Organizers can MANAGE (Insert, Update, Delete, Select) subscribers for THEIR partners
DROP POLICY IF EXISTS "Organizers can manage subscribers" ON partner_subscribers;
CREATE POLICY "Organizers can manage subscribers"
ON partner_subscribers FOR ALL
TO authenticated
USING (
  partner_id IN (
    SELECT id FROM partners WHERE user_id = auth.uid()
    UNION
    SELECT partner_id FROM partner_team_members WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  partner_id IN (
    SELECT id FROM partners WHERE user_id = auth.uid()
    UNION
    SELECT partner_id FROM partner_team_members WHERE user_id = auth.uid()
  )
);
