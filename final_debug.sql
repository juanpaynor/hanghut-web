-- ==============================================
-- DIAGNOSTIC SCRIPT
-- Run this in Supabase SQL Editor to find the specific error.
-- ==============================================

DO $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_email text := 'debug_test_123@example.com';
  v_name text := 'Debug Test';
BEGIN
  RAISE NOTICE '--- TEST 1: Manual Insert into public.users ---';
  
  BEGIN
    INSERT INTO public.users (
      id, email, display_name, created_at, updated_at
    ) VALUES (
      v_id, v_email, v_name, now(), now()
    );
    RAISE NOTICE '✅ TEST 1 PASSED: Insert successful';
    
    -- Cleanup
    DELETE FROM public.users WHERE id = v_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ TEST 1 FAILED: %', SQLERRM;
    -- We continue to test 2 even if 1 fails? No, 1 is the core.
  END;

  RAISE NOTICE '--- TEST 2: Trigger Simulation (Insert into auth.users) ---';
  
  BEGIN
    INSERT INTO auth.users (
      id, email, raw_user_meta_data, created_at, updated_at, aud, role
    ) VALUES (
      v_id, 
      'debug_trigger_123@example.com', 
      '{"display_name": "Trigger Test"}', 
      now(), now(), 'authenticated', 'authenticated'
    );
    RAISE NOTICE '✅ TEST 2 PASSED: Auth Insert successful (Trigger ran without error)';
    
    -- Cleanup
    DELETE FROM public.users WHERE id = v_id;
    DELETE FROM auth.users WHERE id = v_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ TEST 2 FAILED: %', SQLERRM;
  END;

END $$;
