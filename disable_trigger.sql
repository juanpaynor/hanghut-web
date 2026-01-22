-- ==============================================
-- TEMPORARY FIX: Disable Broken Trigger
-- Run this in Supabase SQL Editor
-- ==============================================

-- Drop the trigger (we'll handle user creation manually for now)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- The function can stay (we just won't call it)
-- When the App Team fixes the trigger implementation, they can recreate it.
