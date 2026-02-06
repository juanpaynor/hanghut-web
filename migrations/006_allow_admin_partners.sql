-- Migration: Allow Admins to View and Update Partner Records
-- Context: Required for Admin KYC Review Panel to work (approve/reject partners)

-- 1. Allow admins to view all partners
DROP POLICY IF EXISTS "Admins can view all partners" ON public.partners;
CREATE POLICY "Admins can view all partners" ON public.partners
FOR SELECT
USING (public.is_user_admin() = true);

-- 2. Allow admins to update partners (for verification status)
DROP POLICY IF EXISTS "Admins can update partners" ON public.partners;
CREATE POLICY "Admins can update partners" ON public.partners
FOR UPDATE
USING (public.is_user_admin() = true);

-- 3. Allow admins to delete partners (optional, good for cleanup)
DROP POLICY IF EXISTS "Admins can delete partners" ON public.partners;
CREATE POLICY "Admins can delete partners" ON public.partners
FOR DELETE
USING (public.is_user_admin() = true);
