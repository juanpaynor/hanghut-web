-- Support inbox: mirror threads into the app's chat inbox, and notify.
--
-- Two things the app team asked for in team_comms #305/#310, both hung off the
-- trigger that already fires on every support message so they cannot drift out
-- of sync with the row that caused them:
--
--   1. upsert_support_inbox(...) — theirs, shipped in #310 — so a support thread
--      appears in the app's existing chat inbox as a conversation. Our
--      support_messages stays the only copy of the text; that function writes a
--      pointer row, not content.
--   2. a notifications row of type 'support_reply', which their push tap branch
--      routes on.
--
-- WHY INSIDE THE TRIGGER RATHER THAN FROM THE SERVER: the app writes to
-- support_messages directly through RLS, so our Next server never runs for an
-- app user's message. Anything hung off our server would work on web and
-- silently not on mobile — the exact asymmetry #306 flagged.

-- ---------------------------------------------------------------------------
-- 1. 'support_reply' is a new notification type.
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
    type = ANY (ARRAY[
        'like', 'comment', 'follow', 'mention', 'badge_earned', 'trip_match',
        'hangout_invite', 'follower_hangout', 'group_join_request', 'group_approved',
        'friend_joined', 'chat', 'join_request', 'new_follower', 'ticket_confirmed',
        'new_event', 'event_reminder_24h', 'event_reminder_1h', 'member_joined',
        'subscription_confirmed', 'subscription_expired', 'kyc_verified', 'kyc_rejected',
        'support_reply'
    ])
);

-- ---------------------------------------------------------------------------
-- 2. The trigger.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_support_ticket_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_ticket   support_tickets%ROWTYPE;
    v_preview  text;
BEGIN
    UPDATE support_tickets
    SET last_message_at  = NEW.created_at,
        last_sender      = NEW.sender,
        organizer_unread = CASE WHEN NEW.sender = 'agent' AND NEW.internal = false
                                THEN organizer_unread + 1 ELSE organizer_unread END,
        agent_unread     = CASE WHEN NEW.sender = 'requester'
                                THEN agent_unread + 1 ELSE agent_unread END,
        status           = CASE WHEN NEW.sender = 'requester' AND status = 'resolved'
                                THEN 'open' ELSE status END,
        updated_at       = now()
    WHERE id = NEW.ticket_id
    RETURNING * INTO v_ticket;

    -- An internal note is a note to ourselves. It must reach neither the app
    -- inbox nor a notification: both carry a text preview, and a preview of an
    -- internal note is the same leak the `internal` flag exists to prevent.
    IF NEW.internal OR v_ticket.user_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_preview := left(regexp_replace(NEW.body, '\s+', ' ', 'g'), 140);

    -- Mirror into the app's chat inbox. GUARDED AND SILENT ON PURPOSE: this runs
    -- in the same transaction as the message insert, so an exception escaping
    -- here would REJECT THE USER'S SUPPORT MESSAGE because a badge mirror had a
    -- bad day. The message is already committed and already published over
    -- Ably; a stale inbox row self-heals on the next write to the thread and the
    -- app recomputes the badge when the thread is opened. Late, never lost —
    -- agreed with the app team in #310.
    BEGIN
        PERFORM upsert_support_inbox(
            p_user_id     => v_ticket.user_id,
            p_ticket_id   => NEW.ticket_id,
            p_reference   => v_ticket.reference,
            p_preview     => v_preview,
            -- false does not merely skip the bump, it zeroes the count: the
            -- requester sending means they are looking at the thread, so any
            -- pending count is already stale (their deviation, declared in #310).
            p_bump_unread => (NEW.sender = 'agent')
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'upsert_support_inbox failed for ticket %: %', NEW.ticket_id, SQLERRM;
    END;

    -- Notify the requester that support answered. Only ever agent -> requester:
    -- agents work the queue, which is a screen they are already looking at, and
    -- notifying them here would put every organizer's message in the personal
    -- notification feed of whoever happens to hold the admin account.
    IF NEW.sender = 'agent' THEN
        BEGIN
            INSERT INTO notifications (user_id, actor_id, type, entity_id, title, body, metadata)
            VALUES (
                v_ticket.user_id,
                NEW.sender_user_id,
                'support_reply',
                NEW.ticket_id,
                'HangHut Support',
                v_preview,
                jsonb_build_object(
                    'support_ticket_id', NEW.ticket_id,
                    'reference', v_ticket.reference
                )
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'support_reply notification failed for ticket %: %', NEW.ticket_id, SQLERRM;
        END;
    END IF;

    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Neither of these is anon's to call.
-- ---------------------------------------------------------------------------
-- upsert_support_inbox is SECURITY DEFINER and takes p_user_id directly, so an
-- anon EXECUTE grant lets anyone write an inbox row into any user's app for any
-- ticket id. #310 states it was "revoked from public"; on prod anon could still
-- execute it. This aligns the grant with the stated intent.
REVOKE ALL ON FUNCTION public.upsert_support_inbox(uuid, uuid, text, text, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.upsert_support_inbox(uuid, uuid, text, text, boolean) TO authenticated, service_role;

-- A trigger function has no business being callable directly by anyone.
REVOKE ALL ON FUNCTION public.sync_support_ticket_on_message() FROM anon, authenticated, public;
