-- Fix RLS: Allow admins to view all partners
CREATE POLICY "Admins can view all partners"
ON partners
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.is_admin = true
  )
);

-- Also allow partners to view their own data
CREATE POLICY "Partners can view own data"
ON partners
FOR SELECT
TO authenticated
USING (user_id = auth.uid());
