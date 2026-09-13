-- ticket_type is the discriminator between two SYSTEMS sharing one table, now
-- that account appeals are staying separate (Rich's call, team_comms #315):
--
--   'support'         a thread — support_messages, agents reply, emails fire
--   'account_appeal'  a one-shot form from the app's suspended-account screen,
--                     text in the legacy `message` column, no thread
--
-- `category` remains the routing axis WITHIN support (payouts, events, ...).
-- Different question, different column.
--
-- Two problems this fixes, both reported by the app team in #314 Q1:
--
-- 1. The default was 'account_appeal'. Anything inserted without naming it
--    arrived in the agent queue labelled a ban appeal. 'support' is the safe
--    default: the appeal screen sets the value explicitly, so nothing that
--    wants 'account_appeal' relies on the default to get it.
-- 2. There was no CHECK and no documented vocabulary, so a third convention was
--    one honest guess away.
ALTER TABLE public.support_tickets ALTER COLUMN ticket_type SET DEFAULT 'support';

ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_ticket_type_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_ticket_type_check
    CHECK (ticket_type IN ('support', 'account_appeal'));

COMMENT ON COLUMN public.support_tickets.ticket_type IS
    'Which SYSTEM this row belongs to: ''support'' (a thread in support_messages) or ''account_appeal'' (one-shot form from the app''s suspended screen, text in the legacy `message` column, no thread). Not the same axis as `category`, which routes support threads.';
