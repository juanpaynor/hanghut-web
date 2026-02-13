-- Create storage bucket for event videos
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES (
  'event-videos', 
  'event-videos', 
  true, 
  false, 
  104857600, -- 100MB
  ARRAY['video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 104857600,
  allowed_mime_types = ARRAY['video/mp4', 'video/webm', 'video/quicktime'];

-- Drop existing policies if any
DROP POLICY IF EXISTS "Public Videos Access" ON storage.objects;
DROP POLICY IF EXISTS "Organizers Upload Videos" ON storage.objects;
DROP POLICY IF EXISTS "Organizers Update Videos" ON storage.objects;
DROP POLICY IF EXISTS "Organizers Delete Videos" ON storage.objects;

-- RLS Policies

-- 1. Public Read Access
CREATE POLICY "Public Videos Access" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'event-videos');

-- 2. Authenticated Upload (Folder restriction: userId/filename)
CREATE POLICY "Organizers Upload Videos" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'event-videos' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Authenticated Update
CREATE POLICY "Organizers Update Videos" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'event-videos' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. Authenticated Delete
CREATE POLICY "Organizers Delete Videos" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'event-videos' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);
