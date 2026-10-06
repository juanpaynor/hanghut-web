-- ============================================================================
-- NO-OP. Filed to keep this repo in step with the prod migration ledger.
--
-- I applied this believing the `kind` forwarding in handle_notifications_webhook
-- existed only as an untracked prod edit. It did not: the app team recorded it
-- properly as migration 20261006060154_push_payload_carry_kind. The real gap was
-- narrower — that migration's FILE had never landed in this repo, which is now
-- fixed by adding it.
--
-- So this migration re-applies a function body byte-identical to what was already
-- live (md5(pg_proc.prosrc) unchanged at 87d9e756508433265f52f361732edaa6 before
-- and after). It changes nothing. It exists only because the ledger row exists and
-- a ledger entry with no file in the repo is the same drift it was meant to fix;
-- deleting the row was declined, so it is filed instead.
--
-- 20261006141651 immediately re-applies this with that one character corrected.
-- Neither migration is load-bearing. Read
-- 20261006060154_push_payload_carry_kind.sql for the change that actually matters.
--
-- ALSO NOT FIXED HERE: this function is SECURITY DEFINER with no `SET search_path`,
-- and `notifications` carries a client INSERT policy (with_check auth.uid() =
-- actor_id), so it is reachable from a browser. Worth hardening, but it is the app
-- team's function and that is a separate decision from recording what it does.
-- Raised with them in the #348 reply rather than changed inside a no-op.
-- ============================================================================
create or replace function public.handle_notifications_webhook()
returns trigger
language plpgsql
security definer
as $function$
DECLARE
    v_data jsonb;
BEGIN
    v_data := jsonb_build_object(
        'type', NEW.type,
        'notification_id', NEW.id,
        'entity_id', NEW.entity_id
    );

    -- Add chat_type only when present (avoids emitting a JSON null, which FCM
    -- rejects). Value is text via ->> so it stays FCM-safe.
    IF NEW.metadata ? 'chat_type' THEN
        v_data := v_data || jsonb_build_object('chat_type', NEW.metadata->>'chat_type');
    END IF;

    -- Disambiguates notifications that share a `type` but point at different
    -- tables -- today that is 'hangout_suggestion' (entity_id is a seed) versus
    -- a plain hangout invite (entity_id is a table).
    IF NEW.metadata ? 'kind' THEN
        v_data := v_data || jsonb_build_object('kind', NEW.metadata->>'kind');
    END IF;

    -- Where a notification names its hangout explicitly, pass it through so
    -- the app never has to infer a table id from entity_id.
    IF NEW.metadata ? 'table_id' THEN
        v_data := v_data || jsonb_build_object('table_id', NEW.metadata->>'table_id');
    END IF;

    PERFORM pgmq.send(
        'push_notifications',
        jsonb_build_object(
            'user_id', NEW.user_id,
            'title', NEW.title,
            'body', NEW.body,
            'data', v_data
        )
    );
    RETURN NEW;
END;
$function$;
