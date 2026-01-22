-- ==============================================
-- DEBUG SCRIPT: Test Auth Trigger
-- Run this in your Supabase SQL Editor to see the exact error
-- ==============================================

DO $$
DECLARE
  new_id uuid := gen_random_uuid();
  check_id uuid;
BEGIN
  RAISE NOTICE 'Starting trigger test...';

  -- 1. Simulate auth user creation (this fires the trigger)
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
    new_id, 
    'test_trigger_debug@example.com', 
    '{"display_name": "Test Trigger Debug"}',
    now(),
    now(),
    'authenticated',
    'authenticated'
  );
  
  -- 2. Verify public user was created
  SELECT id INTO check_id FROM public.users WHERE id = new_id;
  
  IF check_id IS NULL THEN
    RAISE EXCEPTION 'Trigger failed to create public user (No public user found)';
  ELSE
    RAISE NOTICE 'SUCCESS: Public user created correctly!';
  END IF;
  
  -- 3. Cleanup (Rollback happens automatically if exception, but we clean up on success)
  -- Note: We use a transaction rollback to clean up clean test data usually, 
  -- but DO blocks auto-commit if no error. So we delete explicitly.
  DELETE FROM public.users WHERE id = new_id;
  DELETE FROM auth.users WHERE id = new_id;
  
EXCEPTION WHEN OTHERS THEN
  -- Raise the exact error message so we can see it
  RAISE NOTICE 'ERROR DETECTED: %', SQLERRM;
  RAISE; -- Re-raise to show as failure
END $$;
