-- Drop the problematic RLS policies that are causing 500 errors
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Admins can view all reports" ON public.reports;
DROP POLICY IF EXISTS "Admins can update reports" ON public.reports;
DROP POLICY IF EXISTS "Admins can view all tables" ON public.tables;
DROP POLICY IF EXISTS "Admins can view all messages" ON public.messages;

-- Ensure users can read their own profile
-- (Drop first in case it exists with different definition)
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT
  USING (auth.uid() = id);

-- Create a secure function to check if current user is admin
-- This runs with SECURITY DEFINER which bypasses RLS
CREATE OR REPLACE FUNCTION public.is_user_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(is_admin, false)
    FROM public.users
    WHERE id = auth.uid()
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_user_admin() TO authenticated;

-- Now create proper admin policies using the function
-- These won't cause circular dependencies

-- Allow admins to view all users
CREATE POLICY "Admins can view all users" ON public.users
  FOR SELECT
  USING (public.is_user_admin() = true);

-- Allow admins to view all reports
CREATE POLICY "Admins can view all reports" ON public.reports
  FOR SELECT
  USING (public.is_user_admin() = true);

-- Allow admins to update reports
CREATE POLICY "Admins can update reports" ON public.reports
  FOR UPDATE
  USING (public.is_user_admin() = true);

-- Allow admins to view all tables (dining events)
CREATE POLICY "Admins can view all tables" ON public.tables
  FOR SELECT
  USING (public.is_user_admin() = true);

-- Allow admins to view all messages (for moderation)
CREATE POLICY "Admins can view all messages" ON public.messages
  FOR SELECT
  USING (public.is_user_admin() = true);
