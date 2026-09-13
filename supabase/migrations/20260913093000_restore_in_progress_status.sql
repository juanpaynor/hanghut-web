-- REGRESSION FIX. Migration 20260912063854 replaced support_tickets_status_check
-- with ('open','pending','resolved','closed') while building the support inbox.
-- It did not check who else used the column: the account-appeal admin page at
-- /admin/tickets has offered "In Progress" since long before any of this, and
-- respondToTicket writes status='in_progress'. Every such update has been
-- failing the constraint since that migration shipped.
--
-- 'in_progress' belongs to the APPEAL system, not the support-thread one — the
-- thread vocabulary stays open|pending|resolved|closed, and the support console
-- neither sets nor filters on 'in_progress'. It is listed here because the two
-- systems share one table, which is the cost of that decision.
ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_status_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_status_check
    CHECK (status IN ('open', 'pending', 'in_progress', 'resolved', 'closed'));
