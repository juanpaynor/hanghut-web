-- RLS Policies for Events Table

-- Allow organizers to create their own events
DROP POLICY IF EXISTS "Organizers can create own events" ON events;
CREATE POLICY "Organizers can create own events"
ON events
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM partners
    WHERE partners.id = events.organizer_id
    AND partners.user_id = auth.uid()
    AND partners.status = 'approved'
  )
);

-- Allow organizers to view their own events
DROP POLICY IF EXISTS "Organizers can view own events" ON events;
CREATE POLICY "Organizers can view own events"
ON events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM partners
    WHERE partners.id = events.organizer_id
    AND partners.user_id = auth.uid()
  )
);

-- Allow organizers to update their own events
DROP POLICY IF EXISTS "Organizers can update own events" ON events;
CREATE POLICY "Organizers can update own events"
ON events
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM partners
    WHERE partners.id = events.organizer_id
    AND partners.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM partners
    WHERE partners.id = events.organizer_id
    AND partners.user_id = auth.uid()
  )
);

-- Allow admins to view all events
DROP POLICY IF EXISTS "Admins can view all events" ON events;
CREATE POLICY "Admins can view all events"
ON events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.is_admin = true
  )
);

-- Allow admins to update all events
DROP POLICY IF EXISTS "Admins can update all events" ON events;
CREATE POLICY "Admins can update all events"
ON events
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.is_admin = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.is_admin = true
  )
);

-- Allow public to view active events
DROP POLICY IF EXISTS "Public can view active events" ON events;
CREATE POLICY "Public can view active events"
ON events
FOR SELECT
TO anon, authenticated
USING (status = 'active');
