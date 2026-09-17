-- Seat map editor: Draft → Publish.
--
-- Before: the editor's Save wrote straight into event_seat_maps / event_sections /
-- seats — the tables the public picker reads — so a half-finished edit on a live
-- event was buyable immediately, and two editors silently overwrote each other.
--
-- After:
--   seat_map_drafts      one working copy per event, organizer-only. The editor
--                        loads and saves HERE. Optimistic `version` so a stale
--                        editor can't clobber a newer draft.
--   event_seat_maps      unchanged in shape (its existence still means "seated
--                        event" for the storefront / checkout / API), plus a
--                        published_version counter. A never-published map has
--                        NO row here, so buyers never see an unfinished draft.
--   seat_map_versions    immutable snapshot of every publish, with a summary of
--                        what changed. Restore = copy a snapshot into the draft.

CREATE TABLE IF NOT EXISTS public.seat_map_drafts (
  event_id             uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  canvas_data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  version              integer NOT NULL DEFAULT 1,
  -- The published version this draft was forked from (0 = never published).
  base_published_version integer NOT NULL DEFAULT 0,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.seat_map_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  version       integer NOT NULL,
  canvas_data   jsonb NOT NULL,
  -- {sections_added, sections_removed, seats_added, seats_removed, seats_moved,
  --  seats_repriced, seats_blocked, seats_unblocked, total_seats}
  summary       jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at  timestamptz NOT NULL DEFAULT now(),
  published_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (event_id, version)
);
CREATE INDEX IF NOT EXISTS seat_map_versions_event_idx ON public.seat_map_versions(event_id, version DESC);

ALTER TABLE public.event_seat_maps
  ADD COLUMN IF NOT EXISTS published_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Every map that exists today IS live. Call it version 1 and snapshot it so
-- history starts from the current state rather than from nothing.
UPDATE public.event_seat_maps
   SET published_version = 1, published_at = COALESCE(updated_at, created_at, now())
 WHERE published_version = 0;

INSERT INTO public.seat_map_versions (event_id, version, canvas_data, summary, published_at)
SELECT m.event_id, 1, m.canvas_data,
       jsonb_build_object(
         'total_seats', (SELECT count(*) FROM public.seats s WHERE s.event_id = m.event_id),
         'backfilled', true),
       COALESCE(m.updated_at, m.created_at, now())
  FROM public.event_seat_maps m
 WHERE NOT EXISTS (SELECT 1 FROM public.seat_map_versions v WHERE v.event_id = m.event_id AND v.version = 1);

-- ── RLS: organizer (owner) + team seats can read; writes go through the server
--    actions (service role) after an acting-partner check, same as
--    updateSeatingSettings. Nothing here is public.
ALTER TABLE public.seat_map_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seat_map_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seat_map_drafts_team_read ON public.seat_map_drafts;
CREATE POLICY seat_map_drafts_team_read ON public.seat_map_drafts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = seat_map_drafts.event_id
      AND (
        EXISTS (SELECT 1 FROM public.partners p WHERE p.id = e.organizer_id AND p.user_id = (SELECT auth.uid()))
        OR EXISTS (SELECT 1 FROM public.partner_team_members tm
                   WHERE tm.partner_id = e.organizer_id AND tm.user_id = (SELECT auth.uid()) AND tm.is_active)
      )
  ));

DROP POLICY IF EXISTS seat_map_versions_team_read ON public.seat_map_versions;
CREATE POLICY seat_map_versions_team_read ON public.seat_map_versions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = seat_map_versions.event_id
      AND (
        EXISTS (SELECT 1 FROM public.partners p WHERE p.id = e.organizer_id AND p.user_id = (SELECT auth.uid()))
        OR EXISTS (SELECT 1 FROM public.partner_team_members tm
                   WHERE tm.partner_id = e.organizer_id AND tm.user_id = (SELECT auth.uid()) AND tm.is_active)
      )
  ));

GRANT SELECT ON public.seat_map_drafts TO authenticated;
GRANT SELECT ON public.seat_map_versions TO authenticated;
GRANT ALL ON public.seat_map_drafts TO service_role;
GRANT ALL ON public.seat_map_versions TO service_role;
