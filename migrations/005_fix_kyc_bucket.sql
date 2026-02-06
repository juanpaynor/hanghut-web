-- Fix: Create missing storage bucket for KYC
-- Run this if you get "Bucket not found" errors

-- 1. Create the bucket
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES ('kyc-documents', 'kyc-documents', false, false, 5242880, ARRAY['image/jpeg', 'image/png', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- 2. Drop existing policies to avoid conflicts if they partially exist
DROP POLICY IF EXISTS "Partners can upload their own KYC docs" ON storage.objects;
DROP POLICY IF EXISTS "Partners can view their own KYC docs" ON storage.objects;

-- 3. Re-create RLS Policies
CREATE POLICY "Partners can upload their own KYC docs" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'kyc-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Partners can view their own KYC docs" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'kyc-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 4. Allow Admins to View (Missing in original)
CREATE POLICY "Admins can view all KYC docs" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'kyc-documents' AND EXISTS (
  SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
));
