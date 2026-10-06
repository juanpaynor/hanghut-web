-- Let a push say what kind of thing it points at.
--
-- The FCM data payload carried only `type`, `notification_id` and
-- `entity_id`. A suggestion push and a real hangout invite are both
-- `type = 'hangout_invite'` (the type is constrained by
-- `notifications_type_check`, and widening it needs a DROP, which
-- `apply_migration` refuses) — but their `entity_id` means different things: a
-- hangout invite points at a `tables` row, a suggestion points at a
-- `hangout_seeds` row.
--
-- The app routed both to `showTableDetails(entity_id)`, so a suggestion push
-- looked up a seed id in `tables`, found nothing, and silently did nothing.
-- Carrying `kind` through is what lets the app tell them apart.
--
-- Additive and conditional, exactly like `chat_type` above it: a notification
-- without `kind` produces the same payload it always did, and a JSON null is
-- never emitted because FCM rejects those.

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
    -- tables — today that is 'hangout_suggestion' (entity_id is a seed) versus
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
