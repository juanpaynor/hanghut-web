-- Make the storefront "Follow"/newsletter signup actually work.
--
-- It has NEVER worked. partner_subscribers has RLS on with exactly one INSERT
-- policy — "Partners can insert their own subscribers", which requires
-- partner_id to belong to auth.uid(). So a visitor (anon OR a signed-in fan)
-- hitting the follow dialog was denied by RLS, the client saw a generic error
-- and printed "Something went wrong. Please try again."
--
-- Evidence: every row in the table came from somewhere else —
--   checkout 17 (written server-side by the purchase-intent function),
--   app_follow 9 (native app), manual 7 (organizer-added).
-- Not one row has ever originated from the web storefront.
--
-- Fix is an RPC rather than a public INSERT policy on purpose. A blanket
-- "anon can insert" grant on this table would let anyone write arbitrary
-- (partner_id, email, source) rows — including rows labelled source='checkout',
-- which is the audit trail the email tooling trusts. Going through a function
-- keeps the table closed and lets the server own the fields that matter.

CREATE OR REPLACE FUNCTION public.subscribe_to_partner(
    p_partner_id uuid,
    p_email      text,
    p_full_name  text DEFAULT NULL,
    p_source     text DEFAULT 'storefront'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_email  text;
    v_name   text;
    v_source text;
    v_was_new boolean;
BEGIN
    v_email := lower(btrim(COALESCE(p_email, '')));

    -- Deliberately loose: this is a spam guard, not an RFC 5322 validator.
    IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'invalid_email');
    END IF;

    -- Refuse unknown partner ids so the function can't be used to seed rows
    -- against random uuids (or to probe which uuids exist — the caller can only
    -- learn that from a value they already had).
    IF NOT EXISTS (SELECT 1 FROM public.partners WHERE id = p_partner_id) THEN
        RETURN jsonb_build_object('success', false, 'reason', 'unknown_partner');
    END IF;

    -- source is chosen HERE, never trusted from the caller, so a public client
    -- cannot forge a row that looks like it came from a real checkout.
    v_source := CASE WHEN p_source = 'newsletter' THEN 'newsletter' ELSE 'storefront' END;
    v_name   := NULLIF(btrim(COALESCE(p_full_name, '')), '');

    -- Checked before the upsert purely so the UI can say "already following"
    -- instead of "you're now following". Racy under a double-submit, and that is
    -- fine — the worst case is a slightly wrong success message.
    SELECT NOT EXISTS (
        SELECT 1 FROM public.partner_subscribers
        WHERE partner_id = p_partner_id AND email = v_email
    ) INTO v_was_new;

    INSERT INTO public.partner_subscribers (partner_id, email, full_name, source)
    VALUES (p_partner_id, v_email, v_name, v_source)
    ON CONFLICT (partner_id, email) DO UPDATE
        -- Re-subscribing after an unsubscribe re-activates, which is the normal
        -- expectation for a signup form. The unsubscribe link keeps working, and
        -- full_name is only filled in, never overwritten with a blank.
        SET is_active       = true,
            unsubscribed_at = NULL,
            full_name       = COALESCE(EXCLUDED.full_name, partner_subscribers.full_name);

    RETURN jsonb_build_object('success', true, 'already_subscribed', NOT v_was_new);
END;
$function$;

REVOKE ALL ON FUNCTION public.subscribe_to_partner(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscribe_to_partner(uuid, text, text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.subscribe_to_partner(uuid, text, text, text) IS
  'Public storefront follow/newsletter signup. SECURITY DEFINER because partner_subscribers has no public INSERT policy and must not get one — the server sets `source` so a client cannot forge checkout-sourced rows. Idempotent: re-subscribing reactivates.';
