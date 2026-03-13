-- Setup the dedicated storage bucket for APK releases
-- Run in Supabase Dashboard SQL Editor (requires superuser privileges)

-- 1. Create the bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'apk-releases',
  'apk-releases',
  true,
  209715200, -- 200MB limit
  '{application/vnd.android.package-archive,application/octet-stream}'
);

-- 2. Drop existing policies if they exist (safety check)
DROP POLICY IF EXISTS "Public View Access apk-releases" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated User Upload Access apk-releases" ON storage.objects;
DROP POLICY IF EXISTS "User Update Own Assets apk-releases" ON storage.objects;
DROP POLICY IF EXISTS "User Delete Own Assets apk-releases" ON storage.objects;

-- 3. Policy: Anyone can download APKs (public bucket)
CREATE POLICY "Public View Access apk-releases"
ON storage.objects FOR SELECT
USING ( bucket_id = 'apk-releases' );

-- 4. Policy: Authenticated users (admins) can upload
CREATE POLICY "Authenticated User Upload Access apk-releases"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'apk-releases' );

-- 5. Policy: Authenticated users can update
CREATE POLICY "User Update Own Assets apk-releases"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'apk-releases' );

-- 6. Policy: Authenticated users can delete
CREATE POLICY "User Delete Own Assets apk-releases"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'apk-releases' );
