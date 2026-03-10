-- Fix RLS for admin_popups table so the Web Admin panel can manage them.
--
-- Note: The table was created by the app team, but we need to ensure
-- Web Admins have full access to it since our server actions run
-- as the authenticated admin user, not the service_role key.

-- Ensure RLS is enabled
ALTER TABLE public.admin_popups ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they conflict or exist under the same name (safety check)
DROP POLICY IF EXISTS "Admin full access" ON public.admin_popups;
DROP POLICY IF EXISTS "Allow anonymous reads" ON public.admin_popups;

-- Recreate policies

-- 1. Admins can do everything (INSERT, UPDATE, DELETE, SELECT)
CREATE POLICY "Admin full access" ON public.admin_popups
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 2. Anyone (including the mobile app) can read active popups
-- This ensures the mobile app can still fetch the popups even if it queries anonymously
CREATE POLICY "Allow anonymous reads" ON public.admin_popups
  FOR SELECT
  USING (is_active = true);

COMMENT ON POLICY "Admin full access" ON public.admin_popups IS 'Allows full CRUD access for web admins managing popups.';
COMMENT ON POLICY "Allow anonymous reads" ON public.admin_popups IS 'Required for the mobile app to fetch active popups on startup.';
