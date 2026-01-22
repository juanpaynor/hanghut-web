-- Add is_admin column to public.users table
-- This migration adds admin role capability to the HangHut platform

-- Step 1: Add the is_admin column (defaults to false for all existing users)
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Step 2: Create an index for faster admin queries
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON public.users(is_admin) WHERE is_admin = true;

-- Step 3: Add a comment for documentation
COMMENT ON COLUMN public.users.is_admin IS 'Flag indicating if user has admin privileges for the web dashboard';

-- Step 4: Update RLS policies to allow admins to read all data
-- Note: You may need to adjust these based on your existing RLS setup

-- Allow admins to read all users
CREATE POLICY "Admins can view all users" ON public.users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Allow admins to read all reports
CREATE POLICY "Admins can view all reports" ON public.reports
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Allow admins to update report status
CREATE POLICY "Admins can update reports" ON public.reports
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Allow admins to read all tables (dining events)
CREATE POLICY "Admins can view all tables" ON public.tables
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Allow admins to read all messages (for moderation)
CREATE POLICY "Admins can view all messages" ON public.messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Optional: Manually set your first admin user
-- IMPORTANT: Replace 'YOUR_USER_ID_HERE' with your actual user UUID from auth.users
-- You can find this by running: SELECT id, email FROM auth.users;
-- Then uncomment and run the following line:

-- UPDATE public.users SET is_admin = true WHERE id = 'YOUR_USER_ID_HERE';
