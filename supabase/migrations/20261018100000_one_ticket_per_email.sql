-- Opt-in per event: one ticket per email address.
--
-- Asked for by Anti Club Running Club for Sinadya Run, so that one runner means
-- one email means one set of answers.
--
-- OFF BY DEFAULT, and it has to stay that way. Measured across every selling
-- event on prod, this rule would have refused **1,230 of 3,529 tickets (34.9%)**
-- and turned away 708 of 2,299 buyers; one buyer bought 43 at once. On Sinadya
-- itself it is nearly free: 3 buyers, 4 tickets, 5.3%. So it is a switch an
-- organizer throws for their own event, never a platform behaviour.
--
-- It also blocks the sympathetic case -- a parent registering two children has
-- one inbox between them, and the children have none -- which is why the
-- organizer has to opt in deliberately rather than inherit it.
--
-- The rule lives in SQL for the same reason check_email_address does: the web
-- client, create-purchase-intent and the mobile app must not be able to
-- disagree about who is allowed to buy, and a Deno copy would drift from the
-- TypeScript one the browser runs.

BEGIN;

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS one_ticket_per_email boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.one_ticket_per_email IS
    'Opt-in: refuse a purchase if this email already holds a ticket on this event, and cap the order at one ticket. Enforced in create-purchase-intent via check_one_ticket_per_email. Does not apply to box office or offline sales, which often have no email at all.';

-- ---------------------------------------------------------------------------
-- Canonical form, for COMPARISON ONLY -- never for delivery.
-- ---------------------------------------------------------------------------
-- Without this the rule is theatre. Gmail ignores dots and anything after a
-- '+', so juan@gmail.com, ju.an@gmail.com and juan+sinadya@gmail.com are one
-- inbox and three different strings -- a three-keystroke bypass. The existing
-- email_normalize() only lowercases the domain, and it must keep doing exactly
-- that: it feeds validation and sending, where rewriting a buyer's address
-- would post their ticket somewhere they never typed.
--
-- '+' suffixes are stripped for every domain, not just Gmail. A few providers
-- do treat '+' literally, so this can over-collapse -- which is the safe
-- direction for a rule whose entire purpose is to refuse duplicates. Dots are
-- stripped for Gmail only, because elsewhere they are significant.
CREATE OR REPLACE FUNCTION public.email_canonical(p_raw text)
RETURNS text
 LANGUAGE sql
 IMMUTABLE
 PARALLEL SAFE
AS $fn$
    WITH e AS (
        SELECT lower(trim(COALESCE(p_raw, ''))) AS addr
    ), parts AS (
        SELECT split_part(addr, '@', 1) AS local_part,
               split_part(addr, '@', 2) AS domain
          FROM e
         WHERE addr LIKE '%@%'
    ), stripped AS (
        SELECT split_part(local_part, '+', 1)                      AS local_part,
               CASE WHEN domain = 'googlemail.com' THEN 'gmail.com'
                    ELSE domain END                                AS domain
          FROM parts
    )
    SELECT CASE
             WHEN local_part = '' OR domain = '' THEN NULL
             WHEN domain = 'gmail.com'
                 THEN replace(local_part, '.', '') || '@' || domain
             ELSE local_part || '@' || domain
           END
      FROM stripped;
$fn$;

-- Makes the duplicate lookup an index probe rather than a scan of every ticket
-- on the event. This sits on the checkout path, so it runs on every purchase
-- for an event with the toggle on.
CREATE INDEX IF NOT EXISTS tickets_event_canonical_email_idx
    ON public.tickets (event_id, public.email_canonical(guest_email))
 WHERE guest_email IS NOT NULL;

-- ---------------------------------------------------------------------------
-- The gate.
-- ---------------------------------------------------------------------------
-- service_role ONLY, deliberately. The honest answer to "does this address
-- already hold a ticket" is also an enumeration oracle -- anyone could ask
-- whether a given person is registered for a given event. create-purchase-intent
-- already holds an admin client (it calls check_email_address with it), so the
-- check costs nothing extra there and never becomes an anon-reachable surface.
CREATE OR REPLACE FUNCTION public.check_one_ticket_per_email(
    p_event_id uuid,
    p_email    text,
    p_quantity integer DEFAULT 1
) RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
    v_on       boolean;
    v_canon    text;
    v_existing integer;
BEGIN
    SELECT one_ticket_per_email INTO v_on FROM events WHERE id = p_event_id;

    -- Unknown event, or the organizer never switched this on: say nothing and
    -- let the caller's own gates decide. This must never be the thing that
    -- fails an ordinary sale.
    IF v_on IS NOT TRUE THEN
        RETURN jsonb_build_object('enforced', false, 'blocked', false);
    END IF;

    v_canon := public.email_canonical(p_email);
    IF v_canon IS NULL THEN
        RETURN jsonb_build_object(
            'enforced', true, 'blocked', true, 'code', 'EMAIL_REQUIRED',
            'message', 'This event needs an email address for each ticket.');
    END IF;

    -- A ticket's own address first, the account's only as a fallback: with this
    -- rule on, guest_email IS the attendee's identity.
    SELECT count(*) INTO v_existing
      FROM tickets t
      LEFT JOIN users u ON u.id = t.user_id
     WHERE t.event_id = p_event_id
       AND t.status::text IN ('valid','used')
       AND public.email_canonical(COALESCE(t.guest_email, u.email)) = v_canon;

    IF v_existing > 0 THEN
        RETURN jsonb_build_object(
            'enforced', true, 'blocked', true, 'code', 'EMAIL_ALREADY_REGISTERED',
            'existing', v_existing,
            'message', 'This email already has a ticket for this event. Each ticket needs its own email address.');
    END IF;

    -- One order cannot carry two tickets for one address either, or the rule
    -- is trivially sidestepped by raising the quantity instead of buying twice.
    IF COALESCE(p_quantity, 1) > 1 THEN
        RETURN jsonb_build_object(
            'enforced', true, 'blocked', true, 'code', 'ONE_TICKET_PER_EMAIL',
            'message', 'This event allows one ticket per email address. Please book each person separately with their own email.');
    END IF;

    RETURN jsonb_build_object('enforced', true, 'blocked', false);
END;
$fn$;

-- email_canonical is pure string work and leaks nothing, so it stays callable
-- by the clients that need to pre-warn a buyer before they reach payment.
-- check_one_ticket_per_email does NOT: see the oracle note above. PUBLIC and
-- anon are separate grants and neither implies the other.
REVOKE ALL ON FUNCTION public.check_one_ticket_per_email(uuid, text, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_one_ticket_per_email(uuid, text, integer)
    TO service_role;

COMMIT;
