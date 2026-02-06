-- Migration: Enhance Event Status
-- Goal: Add 'paused', 'cancelled', 'hidden' to the event_status enum.

DO $$
BEGIN
    -- 1. Add new enum values if they don't exist
    ALTER TYPE event_status ADD VALUE IF NOT EXISTS 'paused';
    ALTER TYPE event_status ADD VALUE IF NOT EXISTS 'cancelled';
    ALTER TYPE event_status ADD VALUE IF NOT EXISTS 'hidden';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Check and Drop legacy CHECK constraint if it exists
-- Some earlier schemas might have used a CHECK constraint instead of just the ENUM.
-- We'll try to drop any constraint named 'events_status_check' just in case.
DO $$
BEGIN
    ALTER TABLE events DROP CONSTRAINT IF EXISTS events_status_check;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;
