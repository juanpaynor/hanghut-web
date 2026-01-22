-- ==============================================
-- SIMPLE DEBUG SCRIPT
-- Run this to test the trigger. If it fails, it will show the error.
-- ==============================================

INSERT INTO auth.users (
  id, 
  email, 
  raw_user_meta_data,
  created_at,
  updated_at,
  aud,
  role
)
VALUES (
  gen_random_uuid(), 
  'test_simple_debug@example.com', 
  '{"display_name": "Test Simple Debug"}',
  now(),
  now(),
  'authenticated',
  'authenticated'
);
