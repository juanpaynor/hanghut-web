-- support_tickets has carried SELECT/INSERT/UPDATE/DELETE/TRUNCATE grants for
-- `anon` since it was created. RLS has always stopped anon from reading or
-- writing a row — every policy on it is TO authenticated, so an anonymous
-- caller matches none and gets nothing — which is why this was never
-- exploitable. It is still the wrong grant.
--
-- The reason to care: the table-level grant is the thing that turns a future
-- RLS mistake into a breach rather than a near miss. `user_active_chats` was
-- exactly this shape — correct policies underneath, a grant that meant the
-- moment something bypassed them, anon had full write. Support threads hold
-- account details and payout problems; the grant goes.
REVOKE ALL ON public.support_tickets FROM anon;
GRANT SELECT, INSERT ON public.support_tickets TO authenticated;
