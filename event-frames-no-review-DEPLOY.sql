-- DEPLOY: drop the frame review gate (schema half)
-- Run in the Supabase SQL editor (prod: rahhezqtkpvkialnduft).
--
-- OPTIONAL AND COSMETIC. The frontend already sets `status` explicitly on every
-- insert, so frames go live without this. All this does is stop the schema
-- claiming a review step that no longer exists, so a row created by any future
-- path -- a backfill, an admin tool, the app -- is not silently invisible to the
-- public read, which filters on status = 'approved'.
--
-- Nothing is rewritten: existing rows keep whatever status they have. There are
-- no rows with status 'pending' today (the table had 0 rows when the gate was
-- dropped), so this changes nothing for anything already stored.
--
-- Rich's call 2026-10-28, overriding the approval step the app team asked for in
-- team_comms #368. The `status` column, its check constraint and the kill switch
-- all STAY -- a frame can still be pulled, and 'rejected' still blocks it from
-- being switched back on. What changed is that the default is live, not blocked.

BEGIN;

ALTER TABLE public.event_frames
    ALTER COLUMN status SET DEFAULT 'approved';

COMMENT ON COLUMN public.event_frames.status IS
    'approved by default -- there is no review gate. ''rejected'' is HangHut '
    'pulling a frame, and is the one state the organizer cannot switch back on.';

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY: expect column_default = 'approved'::text, and 0 pending rows.
-- ---------------------------------------------------------------------------
SELECT column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'event_frames' AND column_name = 'status';

SELECT status, count(*) FROM public.event_frames GROUP BY status ORDER BY status;

-- ---------------------------------------------------------------------------
-- ROLLBACK (restores the review gate at the schema level; the frontend would
-- also have to go back to inserting 'pending'):
--   ALTER TABLE public.event_frames ALTER COLUMN status SET DEFAULT 'pending';
-- ---------------------------------------------------------------------------
