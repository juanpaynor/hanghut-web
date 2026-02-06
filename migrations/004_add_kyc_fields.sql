-- Migration: Add KYC fields to existing 'partners' table
-- Context: 'partners' table already exists. We need to extend it for comprehensive KYC.

-- 1. Create Enum for specific KYC Verification Status (separate from general account status)
DO $$ BEGIN
    CREATE TYPE kyc_status_type AS ENUM ('not_started', 'pending_review', 'verified', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Alter 'partners' table
ALTER TABLE public.partners
    -- Contact & Rep Info
    ADD COLUMN IF NOT EXISTS representative_name TEXT,
    ADD COLUMN IF NOT EXISTS contact_number TEXT,
    ADD COLUMN IF NOT EXISTS work_email TEXT,

    -- KYC Status & Notes
    ADD COLUMN IF NOT EXISTS kyc_status kyc_status_type DEFAULT 'not_started',
    ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT,
    
    -- Documents (Secure Paths in Storage)
    ADD COLUMN IF NOT EXISTS id_document_url TEXT,
    ADD COLUMN IF NOT EXISTS business_document_url TEXT,
    
    -- Digital Signature / Terms
    ADD COLUMN IF NOT EXISTS terms_version TEXT,
    ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS terms_accepted_ip INET,
    ADD COLUMN IF NOT EXISTS digital_signature_text TEXT;

-- 3. Create Secure Storage Bucket for KYC Documents
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES ('kyc-documents', 'kyc-documents', false, false, 5242880, ARRAY['image/jpeg', 'image/png', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- 4. RLS for Storage Objects (Allow authed users to upload their own docs)
CREATE POLICY "Partners can upload their own KYC docs" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'kyc-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Partners can view their own KYC docs" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'kyc-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 5. Add comment for clarity
COMMENT ON COLUMN public.partners.kyc_status IS 'Status of the Know Your Customer verification process';
COMMENT ON COLUMN public.partners.digital_signature_text IS 'The text input (full name) provided by user as signature';
