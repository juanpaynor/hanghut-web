import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const { table_id, schedule_id, quantity = 1, guest_details, success_url, failure_url, promo_code, source } = await req.json()

        // Auth. NOTE: experiences are account-only in practice —
        // experience_purchase_intents.user_id is NOT NULL, so a guest booking dies in
        // reserve_experience with 23502 before ever reaching Xendit. Both clients now
        // require login (web slot picker gates on it; the app is entirely behind auth),
        // so the guest branch below is unreachable and kept only as a guard.
        const { data: { user } } = await supabaseClient.auth.getUser()

        if (!user && !guest_details?.email) {
            return new Response(
                JSON.stringify({ error: 'Please provide your contact details to continue.' }),
                { status: 401, headers: corsHeaders }
            )
        }

        // Profile lookup for name/phone.
        //
        // BUGFIX: this previously selected `full_name, phone` from public.users — that
        // table has NEITHER (it has display_name; phone lives on auth.users). PostgREST
        // returned an error, only `data` was destructured so the error was swallowed,
        // and userProfile was therefore ALWAYS null. Result: every authenticated
        // experience booking sent Xendit given_names 'Guest', surname '-', and the dummy
        // +639000000000. Same class of bug already fixed on the events checkout.
        // The error is now logged so a future column rename fails loudly, not silently.
        let userProfile: { display_name: string | null } | null = null
        if (user) {
            const { data: profile, error: profileError } = await supabaseClient
                .from('users')
                .select('display_name')
                .eq('id', user.id)
                .single()
            if (profileError) {
                console.error('⚠️ Profile lookup failed (falling back to auth metadata):', profileError.message)
            }
            userProfile = profile
        }

        // Phone comes off the AUTH user — public.users has no phone column at all.
        const authPhone = (user as { phone?: string } | null)?.phone ?? null

        // Reserve spot via RPC
        const { data: intentId, error: reserveError } = await supabaseClient.rpc('reserve_experience', {
            p_table_id: table_id,
            p_schedule_id: schedule_id,
            p_user_id: user?.id ?? null,
            p_quantity: quantity,
            p_guest_email: guest_details?.email ?? user?.email ?? null,
            p_guest_name: guest_details?.name ?? userProfile?.display_name ?? null,
            p_guest_phone: guest_details?.phone ?? authPhone,
            // Validated inside the RPC, not here: the discount and the amount we
            // then ask Xendit for have to be decided in one place, under the same
            // lock that reserves the slot.
            p_promo_code: typeof promo_code === 'string' && promo_code.trim() ? promo_code.trim() : null,
            // Whitelisted, so a caller cannot claim to be the app to unlock an
            // app_only code.
            p_source: source === 'app' ? 'app' : 'web',
        })

        if (reserveError) {
            // Promo failures are the buyer's to fix, so they come back as a clear
            // message and a code rather than a 500 the UI can only call "failed".
            const PROMO_MESSAGES: Record<string, string> = {
                PROMO_INVALID: "That code isn't valid for this experience.",
                PROMO_EXPIRED: 'This code has expired.',
                PROMO_NOT_STARTED: "This code isn't active yet.",
                PROMO_LIMIT_REACHED: 'This code has been fully claimed.',
                PROMO_APP_ONLY: 'This code only works in the HangHut app.',
            }
            const hit = Object.keys(PROMO_MESSAGES).find((k) => reserveError.message?.includes(k))
            if (hit) {
                return new Response(
                    JSON.stringify({ error: PROMO_MESSAGES[hit], code: hit }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
            throw new Error(reserveError.message)
        }

        // Fetch created intent
        const { data: intent, error: fetchError } = await supabaseAdmin
            .from('experience_purchase_intents')
            .select('*, table:tables(title, price_per_person, partner_id)')
            .eq('id', intentId)
            .single()

        if (fetchError || !intent) throw new Error('Failed to fetch purchase intent')

        // Look up partner Xendit details for payment splitting
        let partnerXenditAccountId: string | null = null
        let partnerSplitRuleId: string | null = null
        // Cards + GCash require Xendit to have ACTIVATED the capabilities on the
        // sub-account (account_holder.capabilities.status:live) — gated on the flag
        // the webhook flips. useMainWallet partners get them unconditionally.
        let useMainWallet = false
        let cardsGcashLive = false

        if (intent.table?.partner_id) {
            const { data: partner } = await supabaseAdmin
                .from('partners')
                .select('xendit_account_id, split_rule_id, use_main_wallet, xendit_cards_gcash_live')
                .eq('id', intent.table.partner_id)
                .single()

            if (partner) {
                partnerXenditAccountId = partner.xendit_account_id
                partnerSplitRuleId = partner.split_rule_id
                useMainWallet = partner.use_main_wallet === true
                cardsGcashLive = partner.xendit_cards_gcash_live === true
                console.log(`🏦 XenPlatform: routing to sub-account ${partnerXenditAccountId}, split rule ${partnerSplitRuleId}`)
            }
        }

        // Build Xendit session
        const xenditKey = Deno.env.get('XENDIT_SECRET_KEY')
        if (!xenditKey) throw new Error('XENDIT_SECRET_KEY not configured')

        console.log(`🎟️ Creating Xendit Invoice for Experience Intent: ${intentId}`)

        const guestEmail = guest_details?.email || user?.email || 'customer@hanghut.com'
        const guestName = guest_details?.name || userProfile?.display_name || 'Guest'
        const nameParts = guestName.trim().split(' ')
        const givenNames = nameParts[0] || 'Guest'
        const surname = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '-'

        let rawPhone = guest_details?.phone || authPhone || ''
        rawPhone = rawPhone.replace(/[\s\-\(\)]/g, '')
        if (rawPhone.startsWith('09')) rawPhone = '+63' + rawPhone.substring(1)
        if (rawPhone && !rawPhone.startsWith('+')) rawPhone = '+' + rawPhone
        const mobileNumber = rawPhone || '+639000000000'

        const customerId = user ? `${user.id}_${Date.now()}` : `guest_${Date.now()}`

        const sessionBody = {
            reference_id: intent.xendit_external_id,
            session_type: 'PAY',
            mode: 'PAYMENT_LINK',
            amount: Math.round(intent.total_amount),
            currency: 'PHP',
            country: 'PH',
            // CARDS + GCASH only once Xendit has activated the sub-account's
            // capabilities (or for main-wallet partners). Base channels work for any
            // account; QRPH stays as before for the experiences flow.
            allowed_payment_channels: [
                'QRPH',
                ...(useMainWallet || cardsGcashLive ? ['CARDS', 'GCASH'] : []),
                'PAYMAYA',
                'GRABPAY',
                'BPI_DIRECT_DEBIT',
                'UBP_DIRECT_DEBIT',
                'RCBC_DIRECT_DEBIT',
            ],
            customer: {
                reference_id: customerId,
                type: 'INDIVIDUAL',
                email: guestEmail,
                mobile_number: mobileNumber,
                individual_detail: {
                    given_names: givenNames,
                    surname: surname,
                }
            },
            description: `${quantity}x ${intent.table.title}`,
            success_return_url: success_url || 'https://hanghut.com/experiences/success',
            cancel_return_url: failure_url || 'https://hanghut.com/experiences',
            metadata: {
                table_id,
                schedule_id,
                intent_id: intentId,
                user_id: user?.id ?? null,
            }
        }

        const headers = new Headers()
        headers.set('Authorization', `Basic ${btoa(xenditKey + ':')}`)
        headers.set('Content-Type', 'application/json')

        if (partnerXenditAccountId) {
            headers.set('for-user-id', partnerXenditAccountId)
            if (partnerSplitRuleId) headers.set('with-split-rule', partnerSplitRuleId)
        }

        const xenditResponse = await fetch('https://api.xendit.co/sessions', {
            method: 'POST',
            headers,
            body: JSON.stringify(sessionBody)
        })

        if (!xenditResponse.ok) {
            const err = await xenditResponse.text()
            console.error('❌ Xendit Error:', err)
            throw new Error(`Payment provider error: ${err}`)
        }

        const session = await xenditResponse.json()
        console.log('✅ Xendit Payment Session Created:', session)

        await supabaseAdmin
            .from('experience_purchase_intents')
            .update({
                xendit_invoice_id: session.id,
                xendit_invoice_url: session.payment_link_url
            })
            .eq('id', intentId)

        return new Response(JSON.stringify({
            success: true,
            data: {
                intent_id: intentId,
                payment_url: session.payment_link_url
            }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    } catch (error) {
        console.error('Error:', error)
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders })
    }
})
