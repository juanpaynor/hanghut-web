-- Setup the dedicated storage bucket for admin popups
-- Note: This requires postgres superuser privileges which your supabase dashboard SQL editor has.

-- 1. Create the bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'admin-popups',
  'admin-popups',
  true,
  5242880, -- 5MB limit
  '{image/png,image/jpeg,image/webp,image/gif}'
);

-- 2. Drop existing policies if they exist (safety check)
DROP POLICY IF EXISTS "Public View Access admin-popups" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated User Upload Access admin-popups" ON storage.objects;
DROP POLICY IF EXISTS "User Update Own Assets admin-popups" ON storage.objects;
DROP POLICY IF EXISTS "User Delete Own Assets admin-popups" ON storage.objects;

-- 3. Policy: Anyone can view images from the bucket (since it's public)
CREATE POLICY "Public View Access admin-popups"
ON storage.objects FOR SELECT
USING ( bucket_id = 'admin-popups' );

-- 4. Policy: Any authenticated user (admins) can upload to this bucket
CREATE POLICY "Authenticated User Upload Access admin-popups"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'admin-popups' );

-- 5. Policy: Users can only update their own uploads (identified by owner field)
CREATE POLICY "User Update Own Assets admin-popups"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'admin-popups' AND owner = auth.uid() );

-- 6. Policy: Users can only delete their own uploads
CREATE POLICY "User Delete Own Assets admin-popups"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'admin-popups' AND owner = auth.uid() );
