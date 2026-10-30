-- DEPLOY: let an event's URL follow its title while nothing has been sold
-- Run in the Supabase SQL editor (prod: rahhezqtkpvkialnduft).
--
-- THE BUG: set_event_slug() only generates a slug when the incoming one is
-- empty. So an organizer who renames an event keeps the old URL forever, and
-- there is no slug field anywhere in the organizer form -- the URL is simply
-- unreachable to them. Pencilbox renamed "Pencil Box Year 3" to
-- "TRESPASSING SA MUSIC MUSEUM" and the page stayed at /events/pencil-box-year-3.
--
-- WHY NOT JUST ALWAYS REGENERATE: a slug is a public address. Once tickets are
-- sold it is in confirmation emails, posters, paid ads and chat threads, and
-- silently moving it 404s every one of them. 12 events on prod already have a
-- title that no longer matches their slug AND have sold tickets -- those must
-- not move, and this migration does not move them.
--
-- THE RULE: regenerate only when ALL of these hold.
--   * it is an UPDATE, and
--   * the caller did NOT set the slug itself (so a deliberate custom slug wins), and
--   * the title actually changed, and
--   * the event has never sold a ticket.
-- "No ticket sold" is the honest boundary. Before the first sale the URL has no
-- dependants that we would be breaking; after it, it has many.
--
-- `available` tickets do NOT count as sold: every event is pre-minted with a pool
-- of them (see mint_event_tickets). Counting those would freeze the slug of an
-- event that has sold nothing.
--
-- ROLLBACK is at the bottom.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_event_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.slug IS NULL OR btrim(NEW.slug) = '' THEN
        NEW.slug := unique_slug(NEW.title, 'events', NEW.id);

    ELSIF TG_OP = 'UPDATE'
      AND NEW.slug IS NOT DISTINCT FROM OLD.slug      -- caller left the slug alone
      AND NEW.title IS DISTINCT FROM OLD.title        -- but renamed the event
      AND NOT EXISTS (
            SELECT 1 FROM tickets
             WHERE event_id = NEW.id
               AND status IN ('valid', 'used')        -- a real sale, not the pool
          )
    THEN
        NEW.slug := unique_slug(NEW.title, 'events', NEW.id);

    ELSE
        NEW.slug := slugify(NEW.slug);
        IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM events WHERE slug = NEW.slug) THEN
            NEW.slug := unique_slug(NEW.slug, 'events', NEW.id);
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY 1: an unsold event's slug follows a rename. Rolled back, so nothing
-- is left changed. Expect slug_after = 'verify-probe-renamed'.
-- ---------------------------------------------------------------------------
-- BEGIN;
--   UPDATE public.events SET title = 'Verify probe renamed'
--    WHERE id = '<an unsold event id>';
--   SELECT title, slug AS slug_after FROM public.events WHERE id = '<same id>';
-- ROLLBACK;

-- ---------------------------------------------------------------------------
-- VERIFY 2: THE ONE THAT MATTERS. A SOLD event's slug must NOT move.
-- Expect slug_after to equal the slug it had before.
-- ---------------------------------------------------------------------------
-- BEGIN;
--   SELECT slug AS slug_before FROM public.events WHERE id = '<a SOLD event id>';
--   UPDATE public.events SET title = 'Verify probe renamed'
--    WHERE id = '<same sold event id>';
--   SELECT slug AS slug_after FROM public.events WHERE id = '<same id>';
-- ROLLBACK;

-- Pick ids for the two probes above with:
--   SELECT e.id, e.title, e.slug,
--          (SELECT count(*) FROM tickets t
--            WHERE t.event_id = e.id AND t.status IN ('valid','used')) AS sold
--     FROM events e ORDER BY sold DESC NULLS LAST LIMIT 5;

-- ---------------------------------------------------------------------------
-- ROLLBACK (restores the old behaviour: a rename never moves the URL)
--
-- CREATE OR REPLACE FUNCTION public.set_event_slug()
--  RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
-- AS $function$
-- BEGIN
--     IF NEW.slug IS NULL OR btrim(NEW.slug) = '' THEN
--         NEW.slug := unique_slug(NEW.title, 'events', NEW.id);
--     ELSE
--         NEW.slug := slugify(NEW.slug);
--         IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM events WHERE slug = NEW.slug) THEN
--             NEW.slug := unique_slug(NEW.slug, 'events', NEW.id);
--         END IF;
--     END IF;
--     RETURN NEW;
-- END;
-- $function$;
-- ---------------------------------------------------------------------------
