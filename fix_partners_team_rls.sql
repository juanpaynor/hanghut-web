-- Allow Team Members (Managers/Scanners) to VIEW their Partner record
-- Currently, RLS might only allow the partner.user_id (owner) to see it.

DROP POLICY IF EXISTS "Team members can view their partner" ON partners;
CREATE POLICY "Team members can view their partner"
ON partners
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT partner_id FROM partner_team_members 
    WHERE user_id = auth.uid()
  )
  OR
  user_id = auth.uid() -- Existing owner check (redundant but safe)
);
