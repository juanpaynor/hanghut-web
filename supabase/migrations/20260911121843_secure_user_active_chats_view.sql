-- `user_active_chats` is a plain SELECT over `chat_inbox`, which has correct
-- RLS (a user sees and updates only their own rows). The view was created
-- without `security_invoker`, so it executed as its owner (postgres) and the
-- underlying policies were never consulted: anon could read all 382 rows
-- across 97 users. Worse, the view is single-table and column-faithful, so
-- Postgres made it auto-updatable, and `GRANT ALL ... TO anon` turned that
-- into an anonymous DELETE of every inbox row.
--
-- security_invoker makes the view honour chat_inbox's policies, which is the
-- behaviour the view was always assumed to have. The grants are then narrowed
-- to what the view is for: reading your own inbox. Every write to chat_inbox
-- already happens through SECURITY DEFINER triggers and RPCs, so no client
-- path loses anything.
ALTER VIEW public.user_active_chats SET (security_invoker = true);

REVOKE ALL ON public.user_active_chats FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON public.user_active_chats FROM authenticated;

GRANT SELECT ON public.user_active_chats TO authenticated;
