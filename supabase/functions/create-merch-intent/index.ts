import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Standalone merch checkout. Mirrors create-experience-intent: reserve via RPC,
// then open a Xendit payment session routed to the organizer's sub-account. The
// webhook confirms on payment (mer_-prefixed reference_id) → confirm_merch_order.
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

        const {
            items, guest_details, event_id, fulfillment_mode = 'claim',
            shipping_address, success_url, failure_url,
        } = await req.json()

        if (!Array.isArray(items) || items.length === 0) {
            return new Response(JSON.stringify({ error: 'No items in cart.' }), { status: 400, headers: corsHeaders })
        }

        const { data: { user } } = await supabaseClient.auth.getUser()
        if (!user && !guest_details?.email) {
            return new Response(JSON.stringify({ error: 'Please provide your contact details to continue.' }), { status: 401, headers: corsHeaders })
        }

        let userProfile: { display_name: string | null } | null = null
        if (user) {
            const { data: profile } = await supabaseClient.from('users').select('display_name').eq('id', user.id).single()
            userProfile = profile
        }

        // Reserve (prices the order, checks stock) via RPC.
        const { data: orderId, error: reserveError } = await supabaseClient.rpc('reserve_merch', {
            p_items: items,
            p_user_id: user?.id ?? null,
            p_guest_email: guest_details?.email ?? user?.email ?? null,
            p_guest_name: guest_details?.name ?? userProfile?.display_name ?? null,
            p_guest_phone: guest_details?.phone ?? userProfile?.phone ?? null,
            p_event_id: event_id ?? null,
            p_fulfillment_mode: fulfillment_mode === 'ship' ? 'ship' : 'claim',
            p_shipping_address: shipping_address ?? null,
        })
        if (reserveError) throw new Error(reserveError.message)

        const { data: order, error: fetchError } = await supabaseAdmin
            .from('merch_orders').select('*').eq('id', orderId).single()
        if (fetchError || !order) throw new Error('Failed to fetch merch order')

        // Organizer Xendit routing (same as tickets/experiences).
        let partnerXenditAccountId: string | null = null
        let partnerSplitRuleId: string | null = null
        let useMainWallet = false
        let cardsGcashLive = false
        const { data: partner } = await supabaseAdmin
            .from('partners')
            .select('xendit_account_id, split_rule_id, use_main_wallet, xendit_cards_gcash_live')
            .eq('id', order.organizer_id).single()
        if (partner) {
            partnerXenditAccountId = partner.xendit_account_id
            partnerSplitRuleId = partner.split_rule_id
            useMainWallet = partner.use_main_wallet === true
            cardsGcashLive = partner.xendit_cards_gcash_live === true
        }

        const xenditKey = Deno.env.get('XENDIT_SECRET_KEY')
        if (!xenditKey) throw new Error('XENDIT_SECRET_KEY not configured')

        const guestEmail = guest_details?.email || user?.email || 'customer@hanghut.com'
        const guestName = guest_details?.name || userProfile?.display_name || 'Guest'
        const nameParts = guestName.trim().split(' ')
        const givenNames = nameParts[0] || 'Guest'
        const surname = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '-'

        let rawPhone = guest_details?.phone || userProfile?.phone || ''
        rawPhone = rawPhone.replace(/[\s\-\(\)]/g, '')
        if (rawPhone.startsWith('09')) rawPhone = '+63' + rawPhone.substring(1)
        if (rawPhone && !rawPhone.startsWith('+')) rawPhone = '+' + rawPhone
        const mobileNumber = rawPhone || '+639000000000'

        const customerId = user ? `${user.id}_${Date.now()}` : `guest_${Date.now()}`

        const sessionBody = {
            reference_id: order.xendit_external_id,
            session_type: 'PAY',
            mode: 'PAYMENT_LINK',
            amount: Math.round(order.total_amount),
            currency: 'PHP',
            country: 'PH',
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
                individual_detail: { given_names: givenNames, surname },
            },
            description: `Merch order (${order.quantity} item${order.quantity === 1 ? '' : 's'})`,
            success_return_url: success_url || 'https://hanghut.com/merch/success',
            cancel_return_url: failure_url || 'https://hanghut.com',
            metadata: { merch_order_id: orderId, user_id: user?.id ?? null },
        }

        const headers = new Headers()
        headers.set('Authorization', `Basic ${btoa(xenditKey + ':')}`)
        headers.set('Content-Type', 'application/json')
        // Main-wallet partners settle into the HangHut platform account, so their
        // payment must NOT be routed to a sub-account even if one still exists on
        // the record. Mirrors request-payout / create-purchase-intent.
        if (partnerXenditAccountId && !useMainWallet) {
            headers.set('for-user-id', partnerXenditAccountId)
            if (partnerSplitRuleId) headers.set('with-split-rule', partnerSplitRuleId)
        }

        const xenditResponse = await fetch('https://api.xendit.co/sessions', {
            method: 'POST', headers, body: JSON.stringify(sessionBody),
        })
        if (!xenditResponse.ok) {
            const err = await xenditResponse.text()
            console.error('❌ Xendit Error:', err)
            throw new Error(`Payment provider error: ${err}`)
        }

        const session = await xenditResponse.json()
        await supabaseAdmin
            .from('merch_orders')
            .update({ xendit_invoice_id: session.id, xendit_invoice_url: session.payment_link_url })
            .eq('id', orderId)

        return new Response(JSON.stringify({
            success: true,
            data: { order_id: orderId, payment_url: session.payment_link_url },
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    } catch (error) {
        console.error('Error:', error)
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders })
    }
})
