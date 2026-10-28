-- DEPLOY: event story frames
-- Run in the Supabase SQL editor (prod: rahhezqtkpvkialnduft).
--
-- One new table, two indexes, RLS, one trigger, one storage bucket and two
-- storage policies. Nothing touches an existing table, a column, an RPC or the
-- money path. Safe to run ahead of the frontend: with no rows, every read
-- returns empty and the app's frame feature is simply absent.
--
-- ORDER:
--   1. this file
--   2. push the frontend   <-- organizer upload UI (commit 34158e1)
-- Running 1 alone changes nothing visible. Running 2 first makes the Share tab
-- error on listEventFrames, because the table would not exist yet.
--
-- Checked against the live schema before writing this (all clean):
--   public.event_frames                      absent  -- nothing clobbered
--   storage bucket 'event-frames'            absent  -- nothing clobbered
--   the two storage policy names             unused  -- no name clash
--   public.update_updated_at_column()        exists  -- trigger resolves
--   public.events.organizer_id               exists  -- RLS join is valid
--   public.partners.user_id                  exists  -- RLS join is valid
--   public.users                             exists  -- created_by FK resolves
--
-- KNOWN AND DELIBERATE: the storage insert policy admits ANY authenticated
-- user, because a bucket policy cannot see which event an upload is destined
-- for -- the path is chosen by the client. The gate that matters is on the
-- TABLE: assertOwnsEvent() in the server action, plus the RLS policy below, so
-- a stranger can land a 2MB PNG in the bucket but cannot attach it to an event
-- they do not own, and an unattached object is never served to anyone. Worst
-- case is storage litter, not a live frame.
--
-- ROLLBACK is at the bottom of this file.

BEGIN;

-- ---------------------------------------------------------------------------
-- Event story frames: a transparent 1080x1920 PNG an organizer supplies per
-- event, which the app composites over a user's photo and posts to their story
-- and to Instagram.
--
-- Shape agreed with the app team in team_comms #365-#370:
--
--  * created_by is users.id, NOT partner_id. Ownership is already derivable
--    (event_id -> events.organizer_id IS the partner), so this column records
--    the thing that cannot be reconstructed: which human uploaded it. That is
--    what makes "HangHut staff uploaded on behalf of a partner" auditable.
--    It is never the permission check -- permission comes from the event.
--
--  * SEVERAL rows per event, EXACTLY ONE active. A frame can never be edited in
--    place: stories already posted reference the frame they were made with, so
--    replacing art means a new row and rows necessarily accumulate. The partial
--    unique index below is what stops "which one is current" from being a guess.
--
--  * status defaults to 'pending'. The artwork leaves our surfaces entirely --
--    it lands on someone's Instagram next to the HangHut wordmark -- so nothing
--    an organizer uploads is live until a human approves it.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.event_frames (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id     uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    name         text NOT NULL,
    image_url    text NOT NULL,
    status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
    is_active    boolean NOT NULL DEFAULT false,
    active_from  timestamptz,
    active_until timestamptz,
    created_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.event_frames.created_by IS
    'The human who uploaded this frame, for audit -- NOT the owner and never the '
    'permission check. Ownership is event_id -> events.organizer_id.';

-- The app reads `where event_id = ? and is_active and status = 'approved'` and
-- relies on this for uniqueness, so it never needs an ordering or a tie-break.
CREATE UNIQUE INDEX IF NOT EXISTS event_frames_one_active_per_event
    ON public.event_frames (event_id) WHERE is_active;

-- The app's read path.
CREATE INDEX IF NOT EXISTS event_frames_event_live
    ON public.event_frames (event_id, status) WHERE is_active;

ALTER TABLE public.event_frames ENABLE ROW LEVEL SECURITY;

-- Public read is deliberately narrow: approved AND active only, and the time
-- window when one is set. Enforced here rather than in the client, so it holds
-- whatever any caller asks for.
CREATE POLICY "Anyone can read live frames"
    ON public.event_frames FOR SELECT
    USING (
        is_active
        AND status = 'approved'
        AND (active_from IS NULL OR active_from <= now())
        AND (active_until IS NULL OR active_until > now())
    );

-- The event's organizer sees and manages its own frames in every state.
CREATE POLICY "Organizers manage their own event frames"
    ON public.event_frames FOR ALL
    USING (
        EXISTS (
            SELECT 1
              FROM public.events e
              JOIN public.partners p ON p.id = e.organizer_id
             WHERE e.id = event_frames.event_id
               AND p.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
              FROM public.events e
              JOIN public.partners p ON p.id = e.organizer_id
             WHERE e.id = event_frames.event_id
               AND p.user_id = auth.uid()
        )
    );

CREATE TRIGGER set_event_frames_updated_at
    BEFORE UPDATE ON public.event_frames
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Storage. 2 MB and image/png are enforced here as well as in the form: the
-- form validation is a courtesy to the organizer, this is the actual limit.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('event-frames', 'event-frames', true, 2097152, ARRAY['image/png'])
ON CONFLICT (id) DO UPDATE
    SET public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

CREATE POLICY "Public can read event frame art"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'event-frames');

CREATE POLICY "Authenticated can upload event frame art"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'event-frames');

-- ---------------------------------------------------------------------------
-- Ledger row. The prod migration ledger is squashed to one baseline, so the
-- CLI cannot apply this file -- we record it by hand instead, matching the
-- repo filename supabase/migrations/20261028150000_event_frames.sql. Without
-- this row the CLI reports the migration as pending forever.
-- ---------------------------------------------------------------------------
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261028150000', 'event_frames')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY 1: the table, its RLS flag, and both policies exist.
-- Expect rls_enabled = true and 2 policies.
-- ---------------------------------------------------------------------------
SELECT c.relname                AS table_name,
       c.relrowsecurity         AS rls_enabled,
       (SELECT count(*) FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'event_frames') AS policies
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname = 'event_frames';

-- ---------------------------------------------------------------------------
-- VERIFY 2: the partial unique index is what makes "exactly one active frame"
-- a database guarantee rather than a client convention. Expect one row with
-- indisunique = true and the WHERE is_active predicate.
-- ---------------------------------------------------------------------------
SELECT i.relname AS index_name,
       x.indisunique,
       pg_get_expr(x.indpred, x.indrelid) AS predicate
  FROM pg_index x
  JOIN pg_class i ON i.oid = x.indexrelid
  JOIN pg_class t ON t.oid = x.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
 WHERE n.nspname = 'public' AND t.relname = 'event_frames'
   AND x.indpred IS NOT NULL
 ORDER BY i.relname;

-- ---------------------------------------------------------------------------
-- VERIFY 3: the one-active rule actually REFUSES a second active frame, tested
-- on a real event and rolled back so nothing is left behind. Expect the first
-- INSERT to succeed and the second to raise
--   duplicate key value violates unique constraint "event_frames_one_active_per_event"
-- If BOTH inserts succeed, the index did not apply -- stop and say so.
-- ---------------------------------------------------------------------------
-- BEGIN;
--   INSERT INTO public.event_frames (event_id, name, image_url, status, is_active)
--   SELECT id, 'probe A', 'https://example.invalid/a.png', 'approved', true
--     FROM public.events LIMIT 1;
--
--   INSERT INTO public.event_frames (event_id, name, image_url, status, is_active)
--   SELECT id, 'probe B', 'https://example.invalid/b.png', 'approved', true
--     FROM public.events LIMIT 1;   -- <-- must fail
-- ROLLBACK;

-- ---------------------------------------------------------------------------
-- VERIFY 4: the bucket carries the real limits, not just the form's.
-- Expect public = true, file_size_limit = 2097152, allowed_mime_types = {image/png}.
-- ---------------------------------------------------------------------------
SELECT id, public, file_size_limit, allowed_mime_types
  FROM storage.buckets
 WHERE id = 'event-frames';

-- ---------------------------------------------------------------------------
-- ROLLBACK (run only to undo this file)
--
-- Deliberately leaves the bucket's OBJECTS alone: dropping the table orphans
-- the art but costs nothing, whereas deleting uploaded files is unrecoverable.
-- Empty the bucket from the dashboard afterwards if you actually want it gone.
--
--   DROP TABLE IF EXISTS public.event_frames;            -- takes its policies,
--                                                        -- indexes and trigger
--   DROP POLICY IF EXISTS "Public can read event frame art" ON storage.objects;
--   DROP POLICY IF EXISTS "Authenticated can upload event frame art" ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'event-frames';  -- only once empty
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261028150000';
-- ---------------------------------------------------------------------------
