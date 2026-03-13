-- Table for tracking APK release metadata
-- Run in Supabase Dashboard SQL Editor

CREATE TABLE IF NOT EXISTS apk_releases (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    version_name text NOT NULL,          -- e.g. "1.2.0"
    version_code integer NOT NULL,        -- e.g. 12
    file_url text NOT NULL,               -- Public Supabase storage URL
    file_size_bytes bigint NOT NULL,      -- For display on download page
    release_notes text,                   -- What's new
    is_latest boolean DEFAULT false,      -- Only one row should be true
    uploaded_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

-- Index for quickly finding the latest release
CREATE INDEX idx_apk_releases_latest ON apk_releases (is_latest) WHERE is_latest = true;

-- RLS
ALTER TABLE apk_releases ENABLE ROW LEVEL SECURITY;

-- Everyone can read releases (public download page)
CREATE POLICY "Public read access for apk_releases"
ON apk_releases FOR SELECT
USING (true);

-- Only authenticated users (admins) can insert
CREATE POLICY "Authenticated insert for apk_releases"
ON apk_releases FOR INSERT
TO authenticated
WITH CHECK (true);

-- Only authenticated users (admins) can update
CREATE POLICY "Authenticated update for apk_releases"
ON apk_releases FOR UPDATE
TO authenticated
USING (true);

-- Only authenticated users (admins) can delete
CREATE POLICY "Authenticated delete for apk_releases"
ON apk_releases FOR DELETE
TO authenticated
USING (true);
