-- ==========================================
-- COMPREHENSIVE EVENT SCHEMA REPAIR SCRIPT
-- ==========================================

-- 1. FIX ENUM TYPES
-- Safely add missing values to event_type enum if they don't exist
DO $$
BEGIN
    ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'concert';
    ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'sports';
    ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'food';
    ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'workshop';
    ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'nightlife';
    ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'art';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Safely add 'active' to event_status if not exists (some schemas use 'published')
DO $$
BEGIN
    ALTER TYPE event_status ADD VALUE IF NOT EXISTS 'active';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. ADD MISSING COLUMNS
-- City column
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS city text;

-- Sales End Datetime
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS sales_end_datetime timestamp with time zone;

-- Min/Max Tickets
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS min_tickets_per_purchase integer DEFAULT 1 CHECK (min_tickets_per_purchase >= 1),
ADD COLUMN IF NOT EXISTS max_tickets_per_purchase integer DEFAULT 10 CHECK (max_tickets_per_purchase >= min_tickets_per_purchase);

-- Images Array (JSONB)
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS images jsonb DEFAULT '[]'::jsonb;

-- 3. STORAGE CONFIGURATION
-- Ensure storage buckets exist and are public
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-covers', 'event-covers', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
VALUES ('event-covers', 'event-covers', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
VALUES ('event-images', 'event-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage Policies (Drop first to avoid duplication)
DROP POLICY IF EXISTS "Public Access Covers" ON storage.objects;
CREATE POLICY "Public Access Covers"
ON storage.objects FOR SELECT
USING ( bucket_id = 'event-covers' );

DROP POLICY IF EXISTS "Public Access Images" ON storage.objects;
CREATE POLICY "Public Access Images"
ON storage.objects FOR SELECT
USING ( bucket_id = 'event-images' );

-- Allow authenticated users (partners) to upload
DROP POLICY IF EXISTS "Partners Upload Covers" ON storage.objects;
CREATE POLICY "Partners Upload Covers"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'event-covers' );

DROP POLICY IF EXISTS "Partners Upload Images" ON storage.objects;
CREATE POLICY "Partners Upload Images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'event-images' );

-- 4. VERIFY DATA INTEGRITY
-- Add comments to document columns
COMMENT ON COLUMN events.city IS 'City extracted from Google Places address';
COMMENT ON COLUMN events.sales_end_datetime IS 'When ticket sales automatically close';
COMMENT ON COLUMN events.images IS 'Array of additional event image URLs (max 5)';
