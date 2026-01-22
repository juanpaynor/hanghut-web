-- Add Storefront fields to partners table

-- 1. Slug for custom URLs (e.g. hanghut.com/my-brand)
ALTER TABLE partners 
ADD COLUMN IF NOT EXISTS slug text UNIQUE;

-- Add index for fast lookups by slug
CREATE INDEX IF NOT EXISTS idx_partners_slug ON partners(slug);

-- 2. Branding (Logo already exists as profile_photo_url)
-- Add cover image
ALTER TABLE partners 
ADD COLUMN IF NOT EXISTS cover_image_url text;

-- 3. Social Links (stored as JSON)
ALTER TABLE partners 
ADD COLUMN IF NOT EXISTS social_links jsonb DEFAULT '{}'::jsonb;

-- 4. Description/Bio (already exists as description, ensuring it's text)
-- (No action needed if column exists, but good to be explicit about intent)
COMMENT ON COLUMN partners.slug IS 'Unique identifier for the partner storefront URL';
COMMENT ON COLUMN partners.social_links IS 'JSON object containing social media URLs (facebook, instagram, website, etc)';

-- 5. STORAGE BUCKET FOR PARTNER ASSETS
-- Create bucket if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('partner-assets', 'partner-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Policies for public access
DROP POLICY IF EXISTS "Public Access Partner Assets" ON storage.objects;
CREATE POLICY "Public Access Partner Assets"
ON storage.objects FOR SELECT
USING ( bucket_id = 'partner-assets' );

-- Policies for partner upload (authenticated)
DROP POLICY IF EXISTS "Partners Upload Assets" ON storage.objects;
CREATE POLICY "Partners Upload Assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'partner-assets' );
