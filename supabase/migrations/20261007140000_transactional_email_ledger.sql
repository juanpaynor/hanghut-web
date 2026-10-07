-- Transactional emails have never been recorded. email_sends holds 5,300 rows
-- and every one is a marketing campaign; the ticket email -- the single most
-- important message we send -- leaves no trace at all. The id Resend returns is
-- parsed in send-ticket-email and thrown away.
--
-- The consequence showed up as a support ticket: a buyer paid ₱315, the address
-- he typed had no real domain, Resend bounced it 12 seconds later with
-- "550 5.4.4 Invalid domain", and the only reason anyone found out three weeks
-- later is that he complained.
--
-- (The bounce itself WAS captured -- resend-webhook logs suppressable events
-- even with no matching send row -- and get_event_delivery_failures already
-- surfaces it on the attendee tab. What is missing is the positive record: the
-- id that lets us retrieve what was sent, and any status at all for the mail
-- that did not fail.)

-- ── 1. Let a send point at the order it belongs to ─────────────────────────
ALTER TABLE public.email_sends
    ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'campaign',
    ADD COLUMN IF NOT EXISTS purchase_intent_id uuid
        REFERENCES public.purchase_intents(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS subject text;

COMMENT ON COLUMN public.email_sends.kind IS
'campaign | ticket | experience | reminder ... Existing rows default to campaign, which is what all 5,300 of them are.';

-- Partial: campaign rows (the overwhelming majority) are not in this index.
CREATE INDEX IF NOT EXISTS email_sends_purchase_intent_idx
    ON public.email_sends (purchase_intent_id)
    WHERE purchase_intent_id IS NOT NULL;

-- ── 2. Close the same pg_default_acl trap found on the badge and promo tables
-- anon held INSERT/UPDATE/DELETE/TRUNCATE on both ledgers. RLS refused the row
-- DML (SELECT-only policies, partner-scoped) but TRUNCATE is table-level and
-- RLS does not gate it: the publishable key could have wiped 7,677 email events
-- -- which is the bounce history the delivery-failure banner and the
-- auto-suppression list are both built on.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON public.email_sends, public.email_events, public.email_suppressions
    FROM anon, authenticated;

-- ── 3. One order's email history ───────────────────────────────────────────
-- Unions the forward-looking ledger with the bounce events we already hold, so
-- an order that bounced BEFORE this migration still has something to show. The
-- historical half is matched on address + time rather than on an id we never
-- stored, exactly as get_event_delivery_failures does -- good enough to display,
-- never used to decide anything.
CREATE OR REPLACE FUNCTION public.get_order_email_log(p_intent_id uuid)
RETURNS TABLE (
    resend_id   text,
    recipient   text,
    status      text,
    subject     text,
    occurred_at timestamptz,
    source      text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
    WITH gate AS (
        -- Same authority as the door, as correct_order_email, and as
        -- get_event_delivery_failures: whoever may fix an address may see it.
        SELECT pi.id, pi.created_at,
               lower(COALESCE(pi.guest_email, u.email)) AS email
        FROM purchase_intents pi
        LEFT JOIN users u  ON u.id = pi.user_id
        JOIN events e      ON e.id = pi.event_id
        WHERE pi.id = p_intent_id
          AND can_sell_at_door(e.organizer_id)
    ),
    logged AS (
        SELECT s.resend_id, s.recipient, s.status, s.subject,
               s.created_at AS occurred_at, 'ledger'::text AS source
        FROM email_sends s JOIN gate g ON g.id = s.purchase_intent_id
    ),
    historical AS (
        SELECT ev.resend_id, ev.recipient, ev.type AS status,
               ev.metadata->>'subject' AS subject,
               ev.occurred_at, 'webhook'::text AS source
        FROM email_events ev JOIN gate g ON lower(ev.recipient) = g.email
        WHERE ev.campaign_id IS NULL
          AND ev.occurred_at >= g.created_at
          -- Anything already in the ledger is the better record of the two.
          AND NOT EXISTS (SELECT 1 FROM logged l WHERE l.resend_id = ev.resend_id)
    )
    SELECT * FROM logged
    UNION ALL
    SELECT * FROM historical
    ORDER BY occurred_at DESC;
$fn$;

REVOKE ALL ON FUNCTION public.get_order_email_log(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_email_log(uuid) TO authenticated, service_role;
