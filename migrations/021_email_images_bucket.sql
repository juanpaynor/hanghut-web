-- Setup the storage bucket for email images and admin popups
-- Note: This requires postgres superuser privileges which your supabase dashboard SQL editor has.

-- 1. Create the bucket if it doesn't exist
-- We make it public so that the images can be displayed in emails and the mobile app without auth tokens.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'email-images',
  'email-images',
  true,
  5242880, -- 5MB limit
  '{image/png,image/jpeg,image/webp,image/gif}'
)
ON CONFLICT (id) DO UPDATE SET 
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Ensure RLS is enabled on the objects table (Usually enabled by default in Supabase)
-- (Removed ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; due to permission limits)

-- 3. Set up access policies

-- Drop existing policies if they exist (safety check)
DROP POLICY IF EXISTS "Public View Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated User Upload Access" ON storage.objects;
DROP POLICY IF EXISTS "User Update Own Assets" ON storage.objects;
DROP POLICY IF EXISTS "User Delete Own Assets" ON storage.objects;

-- Policy: Anyone can view images from the bucket (since it's public)
CREATE POLICY "Public View Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'email-images' );

-- Policy: Any authenticated user (admin or organizer) can upload to this bucket
CREATE POLICY "Authenticated User Upload Access"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'email-images' );

-- Policy: Users can only update their own uploads (identified by owner field)
CREATE POLICY "User Update Own Assets"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'email-images' AND owner = auth.uid() );

-- Policy: Users can only delete their own uploads
CREATE POLICY "User Delete Own Assets"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'email-images' AND owner = auth.uid() );
