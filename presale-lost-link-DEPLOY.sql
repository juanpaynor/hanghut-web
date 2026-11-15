-- ============================================================================
-- PRESALE LOST-LINK DEAD END  ---  fix
-- 2026-11-15   ledger 20261115120000
-- ============================================================================
--
-- THE BUG
-- -------
-- trg_presale_confirmation is AFTER *INSERT* ON event_registrations.
-- submit_event_request has a reuse branch: when the person already holds an
-- unconsummated approved/auto_approved registration on the event, it UPDATEs
-- that row instead of inserting a new one. An UPDATE fires no INSERT trigger.
--
-- So: pre-register -> lose the email -> pre-register again to get the link
-- resent -> HTTP 200, "resubmitted": true, and NO EMAIL. Still no link.
-- A dead end that looks like success. Disclosed to the app team in #395.
--
-- THE FIX
-- -------
-- Move the mail logic out of the trigger into a callable function, and call it
-- from BOTH places: the INSERT trigger (unchanged behaviour) and the reuse
-- branch (the fix).
--
-- WHY NOT just make the trigger AFTER INSERT OR UPDATE: event_registrations is
-- updated by the approval flow, by checkout attaching purchase_intent_id, and
-- by the release job. None of those are a resubmission, and no WHEN clause
-- distinguishes them honestly. An explicit call says exactly what it means.
--
-- WHY A COOLDOWN: the resend is now reachable by anyone pressing the button
-- repeatedly. 10 minutes, anchored on event_presale_access.confirmation_sent_at.
--
-- RUN THIS WHOLE FILE AS ONE TRANSACTION. Verification is at the bottom and is
-- meant to be run AFTER, not before.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- PART 1 -- the cooldown anchor
-- ---------------------------------------------------------------------------
-- NULL = never sent. Existing rows were all mailed by the trigger at creation
-- time, so created_at is the honest value to seed -- and it also means every
-- existing registrant is already well past the cooldown.
ALTER TABLE public.event_presale_access
    ADD COLUMN IF NOT EXISTS confirmation_sent_at timestamptz;

UPDATE public.event_presale_access
   SET confirmation_sent_at = created_at
 WHERE confirmation_sent_at IS NULL;


-- ---------------------------------------------------------------------------
-- PART 2 -- the mail logic, now callable
-- ---------------------------------------------------------------------------
-- Lifted verbatim out of send_presale_confirmation(), with three changes:
--   (a) reads the registration by id instead of using NEW.*
--   (b) enforces the cooldown
--   (c) returns whether it actually sent, so callers can tell
CREATE OR REPLACE FUNCTION public.send_presale_confirmation_for(
    p_registration_id uuid,
    p_force           boolean DEFAULT false
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_reg       record;
    v_event     record;
    v_to        text;
    v_name      text;
    v_token     uuid;
    v_last_sent timestamptz;
    v_opens     text;
    v_html      text;
BEGIN
    SELECT r.id, r.event_id, r.user_id, r.guest_email, r.guest_name, r.status
      INTO v_reg
      FROM event_registrations r
     WHERE r.id = p_registration_id;
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- SCOPED TO PRESALE EVENTS ONLY. Firing on every registration would start
    -- mailing 480-odd events' worth of people who have never had a confirmation
    -- and whose organizers have not asked for one. A presale is different: the
    -- whole arrangement is "give us your details now, buy later", and that
    -- promise needs something in writing.
    SELECT e.id, e.title, e.presale_starts_at, e.slug, p.business_name
      INTO v_event
      FROM events e
      LEFT JOIN partners p ON p.id = e.organizer_id
     WHERE e.id = v_reg.event_id
       AND e.presale_starts_at IS NOT NULL;
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- Only people who can actually use it. A 'pending' registrant on an
    -- approval event must not be told they are on the list.
    IF v_reg.status::text NOT IN ('approved', 'auto_approved') THEN
        RETURN false;
    END IF;

    SELECT COALESCE(v_reg.guest_email, u.email),
           COALESCE(NULLIF(btrim(v_reg.guest_name), ''), u.display_name)
      INTO v_to, v_name
      FROM (SELECT 1) dummy
      LEFT JOIN users u ON u.id = v_reg.user_id;

    IF v_to IS NULL OR position('@' in v_to) = 0 THEN
        RETURN false;
    END IF;

    -- COOLDOWN. Checked before the upsert so a burst of resubmits costs one
    -- email, not one per press. p_force is for a deliberate organizer-initiated
    -- resend later; nothing passes it today.
    SELECT a.confirmation_sent_at INTO v_last_sent
      FROM event_presale_access a
     WHERE a.registration_id = p_registration_id;

    IF NOT p_force
       AND v_last_sent IS NOT NULL
       AND v_last_sent > now() - interval '10 minutes' THEN
        RETURN false;
    END IF;

    -- Mint their link now, so the confirmation and the later announcement carry
    -- the SAME one. ON CONFLICT keeps the token stable if they register twice --
    -- which is the entire point of this fix: the resent link must be the link
    -- they already have, not a new one that invalidates the old mail.
    INSERT INTO event_presale_access (event_id, registration_id, email, confirmation_sent_at)
    VALUES (v_reg.event_id, v_reg.id, lower(v_to), now())
    ON CONFLICT (registration_id) DO UPDATE
        SET email               = EXCLUDED.email,
            confirmation_sent_at = now()
    RETURNING token INTO v_token;

    v_opens := to_char(v_event.presale_starts_at AT TIME ZONE 'Asia/Manila',
                       'FMDay FMDD FMMonth, FMHH12:MI AM');

    v_html :=
        '<div style="font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;'
        || 'max-width:520px;margin:0 auto;color:#17152f;line-height:1.55">'
        || '<p style="font-size:16px">Hi ' || COALESCE(split_part(btrim(v_name), ' ', 1), 'there') || ',</p>'
        || '<p style="font-size:16px">You are on the list for <strong>'
        ||     replace(replace(v_event.title, '&', '&amp;'), '<', '&lt;') || '</strong>.</p>'
        || '<p style="font-size:16px">Tickets open to you on <strong>' || v_opens
        || '</strong> (Manila time). We will email you when they do — you do not need to do anything until then.</p>'
        || '<p style="margin:24px 0"><a href="https://hanghut.com/events/'
        ||     COALESCE(v_event.slug, v_event.id::text) || '?pt=' || v_token::text
        || '" style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;'
        || 'text-decoration:none;font-weight:600;display:inline-block">View the event</a></p>'
        || '<p style="font-size:14px;color:#666">This link is yours and is how we know you are on the list, '
        || 'so please keep it to yourself. Being on the list does not reserve a ticket — '
        || 'it means you can buy before everyone else.</p></div>';

    -- Enqueued, not sent. send-registration-email runs with verify_jwt = true,
    -- so calling it from here would mean keeping a service-role key in a
    -- database setting. process-payment-queue already holds one, already
    -- retries, and already dead-letters.
    PERFORM pgmq.send('payment_side_effects', jsonb_build_object(
        'type', 'send_simple_email',
        'data', jsonb_build_object(
            'to', v_to,
            'subject', 'You''re on the list for ' || v_event.title,
            'html', v_html,
            'sender_name', COALESCE(v_event.business_name, 'HangHut')
        )
    ));

    RETURN true;
EXCEPTION WHEN OTHERS THEN
    -- NEVER let a mail problem reach the caller. Both callers are on the
    -- registration path, and losing a confirmation is a nuisance while losing
    -- the registration is the attendee.
    RETURN false;
END;
$function$;

-- This function MAILS A PERSON on demand. anon must never reach it or it is a
-- spam cannon pointed at any registrant whose id you can guess. Both callers
-- are SECURITY DEFINER owned by postgres, so neither needs a client grant.
REVOKE ALL ON FUNCTION public.send_presale_confirmation_for(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_presale_confirmation_for(uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.send_presale_confirmation_for(uuid, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.send_presale_confirmation_for(uuid, boolean) TO service_role;


-- ---------------------------------------------------------------------------
-- PART 3 -- the trigger becomes a thin wrapper
-- ---------------------------------------------------------------------------
-- Trigger definition itself is UNCHANGED (still AFTER INSERT), so no CREATE
-- TRIGGER and no window where the trigger is missing.
CREATE OR REPLACE FUNCTION public.send_presale_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    PERFORM public.send_presale_confirmation_for(NEW.id);
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END;
$function$;


-- ---------------------------------------------------------------------------
-- PART 4 -- the actual fix: make a resubmission resend
-- ---------------------------------------------------------------------------
-- PATCHED PROGRAMMATICALLY, ON PURPOSE. submit_event_request is ~200 lines on
-- the live registration path. Retyping it to add three lines is how a typo gets
-- into something real, so this reads the live definition, inserts the call, and
-- ASSERTS the anchor matched. If the function has been edited since this file
-- was written the assert fails and nothing is applied.
DO $patch$
DECLARE
    v_src     text;
    v_anchor  text;
    v_patched text;
BEGIN
    v_src := pg_get_functiondef(
        'public.submit_event_request(uuid,jsonb,uuid,text,text)'::regprocedure);

    IF position('send_presale_confirmation_for' in v_src) > 0 THEN
        RAISE NOTICE 'submit_event_request already patched; skipping';
        RETURN;
    END IF;

    -- The final RETURN. Appears exactly once: the earlier 'pending' RETURN has
    -- a different field list (it has no 'new_submission').
    v_anchor :=
        E'    RETURN jsonb_build_object(\n'
     || E'        ''registration_id'', v_registration_id,\n'
     || E'        ''status'',          v_status,\n'
     || E'        ''require_approval'', (v_event.require_approval OR v_event.invite_only),\n'
     || E'        ''resubmitted'',     v_reused,\n'
     || E'        ''new_submission'',  NOT v_reused\n'
     || E'    );';

    IF position(v_anchor in v_src) = 0 THEN
        RAISE EXCEPTION 'ANCHOR NOT FOUND in submit_event_request -- it has '
                        'changed since presale-lost-link-DEPLOY.sql was written. '
                        'Nothing applied. Re-read the function and update the anchor.';
    END IF;

    v_patched := replace(v_src, v_anchor,
        E'    -- >>> LOST-LINK FIX (2026-11-15) <<<\n'
     || E'    -- The reuse branch above UPDATEs an existing registration, and\n'
     || E'    -- trg_presale_confirmation is AFTER INSERT, so nothing mailed the\n'
     || E'    -- person their link. That made "I lost the email, let me register\n'
     || E'    -- again" a dead end that returned 200. Resend explicitly.\n'
     || E'    --\n'
     || E'    -- Only on reuse: a fresh INSERT is already covered by the trigger,\n'
     || E'    -- and calling it here too would double-mail every new registrant.\n'
     || E'    -- The helper owns the 10-minute cooldown, the presale-only scope\n'
     || E'    -- and the approved/auto_approved check, and can never raise.\n'
     || E'    IF v_reused THEN\n'
     || E'        PERFORM public.send_presale_confirmation_for(v_registration_id);\n'
     || E'    END IF;\n'
     || E'\n'
     || v_anchor);

    EXECUTE v_patched;
    RAISE NOTICE 'submit_event_request patched';
END
$patch$;


-- ---------------------------------------------------------------------------
-- PART 5 -- ledger
-- ---------------------------------------------------------------------------
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261115120000', 'presale_lost_link_resend')
ON CONFLICT (version) DO NOTHING;

COMMIT;


-- ============================================================================
-- VERIFY  ---  run these AFTER the commit above
-- ============================================================================

-- V1. The call is in the live function, exactly once, and only under v_reused.
-- EXPECT: patched = true, occurrences = 1
-- select position('send_presale_confirmation_for' in pg_get_functiondef(
--            'public.submit_event_request(uuid,jsonb,uuid,text,text)'::regprocedure)) > 0 as patched,
--        (length(pg_get_functiondef('public.submit_event_request(uuid,jsonb,uuid,text,text)'::regprocedure))
--         - length(replace(pg_get_functiondef('public.submit_event_request(uuid,jsonb,uuid,text,text)'::regprocedure),
--                          'send_presale_confirmation_for', '')))
--        / length('send_presale_confirmation_for') as occurrences;

-- V2. anon and authenticated must NOT be able to mail people.
-- EXPECT: false, false, true
-- select has_function_privilege('anon','public.send_presale_confirmation_for(uuid,boolean)','execute')          as anon_can,
--        has_function_privilege('authenticated','public.send_presale_confirmation_for(uuid,boolean)','execute') as authed_can,
--        has_function_privilege('service_role','public.send_presale_confirmation_for(uuid,boolean)','execute')  as service_can;

-- V3. The trigger is still AFTER INSERT and still attached.
-- EXPECT: one row, 'AFTER INSERT'
-- select tgname, pg_get_triggerdef(oid) from pg_trigger
--  where tgname = 'trg_presale_confirmation' and not tgisinternal;

-- V4. Every existing token row has a cooldown anchor, and none is in the future.
-- EXPECT: nulls = 0, future = 0
-- select count(*) filter (where confirmation_sent_at is null) as nulls,
--        count(*) filter (where confirmation_sent_at > now()) as future,
--        count(*) as total
--   from event_presale_access;

-- V5. LIVE BEHAVIOUR TEST, throwaway data only. On the hidden test presale
--     event, re-submit as an existing registrant and confirm a mail is queued.
--     Run the two counts either side of one submit_event_request call.
-- select count(*) from pgmq.q_payment_side_effects;


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Nothing here is destructive: PART 1 is additive, PARTS 2+3 are replaceable,
-- PART 4 adds a guarded call. To undo the behaviour change WITHOUT a revert,
-- make the resend a no-op by forcing the cooldown permanently:
--
--   -- kill switch, no deploy:
--   update event_presale_access set confirmation_sent_at = 'infinity';
--
-- To undo properly:
--   1. CREATE OR REPLACE FUNCTION public.send_presale_confirmation_for(...) so
--      its body is just `RETURN false;` -- both callers then do nothing and the
--      INSERT path loses its confirmation too, so prefer step 2 instead.
--   2. Re-apply the pre-change send_presale_confirmation() (the full body is in
--      git history and in this file's PART 2, which is a verbatim lift) and
--      strip the IF v_reused block from submit_event_request.
--   3. ALTER TABLE public.event_presale_access DROP COLUMN confirmation_sent_at;
-- ============================================================================
