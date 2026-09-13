-- Support tickets never recorded who opened them.
--
-- support_tickets carries user_display_name and user_email, and for the whole
-- life of the support inbox NOTHING has written either one: every support row
-- in production has both NULL, so the agent queue rendered "Unknown" for any
-- thread without a partner to fall back on. The columns are not new and not
-- unused — the account-appeal path populates them, and /admin/tickets searches
-- on user_display_name — so the appeals half of the same table has always had
-- what the support half was missing.
--
-- WHY A TRIGGER AND NOT open_support_ticket(). Two writers open support
-- threads: our RPC, for an organizer using the web dashboard, and the Flutter
-- app, which inserts into support_tickets directly through RLS (team_comms
-- #308). Fixing the RPC would fix organizer threads and leave app threads —
-- HH-1013, the one that reads "Unknown" — exactly as broken, and would need the
-- app team to ship before it was whole. A trigger is the only place that sits
-- under both writers.
--
-- SECURITY DEFINER, narrowly. It reads two columns from the users row named by
-- NEW.user_id, and the INSERT policy on this table is
-- (user_id = auth.uid() AND (partner_id IS NULL OR can_manage_partner(...))),
-- so a caller can only ever cause their own row to be read. There is no input
-- by which this copies a stranger's email onto a ticket the caller can see.
--
-- A SNAPSHOT, deliberately. This is what the person was called when they wrote
-- in, which is the right thing on a queue row you are scanning months later.
-- The live name is already on screen: the context rail reads users directly
-- through get_support_ticket_context, so a rename shows there immediately.

CREATE OR REPLACE FUNCTION public.fill_support_ticket_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Only ever FILLS. A writer that supplies its own values keeps them —
    -- the appeal path already passes both, and this must not overwrite a
    -- caller who knows better.
    IF NEW.user_id IS NOT NULL
       AND (NEW.user_display_name IS NULL OR NEW.user_email IS NULL) THEN
        SELECT COALESCE(NEW.user_display_name, u.display_name, u.username),
               COALESCE(NEW.user_email, u.email)
          INTO NEW.user_display_name, NEW.user_email
          FROM users u
         WHERE u.id = NEW.user_id;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fill_support_ticket_identity() FROM anon, public;

DROP TRIGGER IF EXISTS fill_support_ticket_identity ON public.support_tickets;
CREATE TRIGGER fill_support_ticket_identity
    BEFORE INSERT ON public.support_tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.fill_support_ticket_identity();

-- Backfill. Same COALESCE order as the trigger, and it touches only rows where
-- the value is missing, so the appeal rows that already have a name are left
-- exactly as they were recorded.
UPDATE support_tickets t
   SET user_display_name = COALESCE(t.user_display_name, u.display_name, u.username),
       user_email        = COALESCE(t.user_email, u.email)
  FROM users u
 WHERE u.id = t.user_id
   AND (t.user_display_name IS NULL OR t.user_email IS NULL);
