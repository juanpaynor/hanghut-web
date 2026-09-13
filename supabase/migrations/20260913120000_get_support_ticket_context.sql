-- Who is asking, and what an agent needs before they answer.
--
-- The console showed a display name and an email. For the two categories that
-- actually generate tickets that is nothing: "my payout hasn't arrived" cannot
-- be answered without knowing whether they have ever been paid out, whether
-- their KYC passed, and whether they are on the main wallet; "my ticket never
-- came" cannot be answered without their last few purchases. So an agent opened
-- a second tab, searched the admin area, and pieced it together by hand — which
-- is how a one-line answer takes ten minutes and how two agents give different
-- answers to the same question.
--
-- SECURITY DEFINER with an explicit is_support_agent() gate. It reveals nothing
-- an agent cannot already reach through /admin; it saves them the five clicks.
-- It is a definer function precisely BECAUSE it reads across partners, payouts
-- and purchase_intents — tables whose RLS is written for their owners, not for
-- a support desk.
CREATE OR REPLACE FUNCTION public.get_support_ticket_context(p_ticket_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_ticket   support_tickets%ROWTYPE;
    v_user     users%ROWTYPE;
    v_partner  partners%ROWTYPE;
    v_result   jsonb;
BEGIN
    IF NOT is_support_agent() THEN
        RAISE EXCEPTION 'Not a support agent' USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_ticket FROM support_tickets WHERE id = p_ticket_id;
    IF v_ticket.id IS NULL THEN
        RAISE EXCEPTION 'No such ticket' USING ERRCODE = 'no_data_found';
    END IF;

    SELECT * INTO v_user FROM users WHERE id = v_ticket.user_id;

    -- The ticket's partner if it has one; otherwise the partner this person
    -- owns, because an app user who is also an organizer asks organizer
    -- questions from the app, where no partner_id is attached.
    SELECT * INTO v_partner FROM partners
     WHERE id = v_ticket.partner_id
        OR (v_ticket.partner_id IS NULL AND user_id = v_ticket.user_id)
     LIMIT 1;

    v_result := jsonb_build_object(
        'person', CASE WHEN v_user.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id',           v_user.id,
            'display_name', v_user.display_name,
            'username',     v_user.username,
            'email',        coalesce(v_user.email, v_ticket.user_email),
            'status',       v_user.status,
            'member_since', v_user.created_at
        ) END,

        'partner', CASE WHEN v_partner.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id',              v_partner.id,
            'business_name',   v_partner.business_name,
            'slug',            v_partner.slug,
            'kyc_status',      v_partner.kyc_status,
            -- Main-wallet partners are settled by us, not by their own Xendit
            -- sub-account. It changes the true answer to "where is my money".
            'use_main_wallet', v_partner.use_main_wallet,
            'has_xendit',      (v_partner.xendit_account_id IS NOT NULL),
            'since',           v_partner.created_at,
            'events',          (SELECT count(*) FROM events e WHERE e.organizer_id = v_partner.id)
        ) END,

        -- Money, for the category that generates the hardest tickets.
        'payouts', CASE WHEN v_partner.id IS NULL THEN NULL ELSE (
            SELECT jsonb_build_object(
                'last', (
                    SELECT jsonb_build_object('amount', p.amount, 'status', p.status,
                                              'created_at', p.created_at, 'completed_at', p.completed_at)
                      FROM payouts p WHERE p.partner_id = v_partner.id
                     ORDER BY p.created_at DESC LIMIT 1
                ),
                'in_flight', (
                    SELECT count(*) FROM payouts p
                     WHERE p.partner_id = v_partner.id
                       AND p.status IN ('pending_request', 'processing', 'approved')
                ),
                'paid_out_total', coalesce((
                    SELECT sum(p.amount) FROM payouts p
                     WHERE p.partner_id = v_partner.id AND p.status = 'completed'
                ), 0)
            )
        ) END,

        -- What they bought, for "my ticket never arrived".
        'recent_purchases', coalesce((
            SELECT jsonb_agg(x ORDER BY x->>'created_at' DESC)
              FROM (
                SELECT jsonb_build_object(
                         'event',      e.title,
                         'quantity',   pi.quantity,
                         'total',      pi.total_amount,
                         'status',     pi.status,
                         'method',     pi.payment_method,
                         'created_at', pi.created_at
                       ) AS x
                  FROM purchase_intents pi
                  JOIN events e ON e.id = pi.event_id
                 WHERE pi.user_id = v_ticket.user_id
                 ORDER BY pi.created_at DESC
                 LIMIT 5
              ) s
        ), '[]'::jsonb)
    );

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_support_ticket_context(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_support_ticket_context(uuid) TO authenticated;
