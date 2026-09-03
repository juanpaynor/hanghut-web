import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// Pinned, not floating `@2`: on 2026-09-02 the float resolved to 2.113.0, whose
// postgrest-js submodule 404s on esm.sh, and EVERY edge function using `@2`
// became undeployable with no change on our side. A pin makes deploys
// reproducible instead of dependent on a CDN's latest build.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.0'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// --- PLATFORM PRICING (mirror of src/lib/payment/platform-fees.ts) ---
// Deno can't import from src/, so keep these in sync by hand.
const DEFAULT_PLATFORM_PCT = 2   // new standard commission (%)
const DEFAULT_FIXED_FEE = 15     // per-ticket fixed booking fee (₱)

// Xendit rejects a mobile_number that is not bare E.164 with a hard 400
// API_VALIDATION_ERROR, which fails the whole checkout before the buyer ever
// reaches a payment page. Buyers type "+63 967 246 7837", "0930 2262 977 ",
// "(0917) 555-1234" — all legitimate, all rejected. Normalise here; on anything
// unparseable fall back to the placeholder rather than losing the sale, since
// Xendit only uses this for the receipt.
const PLACEHOLDER_PHONE = '+639000000000'
function toE164PH(raw: unknown): string {
    if (typeof raw !== 'string') return PLACEHOLDER_PHONE
    const trimmed = raw.trim()
    // Remember the buyer's intent before stripping: a leading + means they already
    // wrote a country code, so the PH local-prefix rules below must not apply.
    const hadPlus = trimmed.startsWith('+')
    let digits = trimmed.replace(/\D/g, '')
    if (!digits) return PLACEHOLDER_PHONE
    if (!hadPlus) {
        // PH local forms: 09XXXXXXXXX (11 digits) and 9XXXXXXXXX (10).
        if (digits.length === 11 && digits.startsWith('09')) digits = '63' + digits.slice(1)
        else if (digits.length === 10 && digits.startsWith('9')) digits = '63' + digits
    }
    // E.164 caps at 15 digits; anything very short is a typo, not a number.
    if (digits.length < 8 || digits.length > 15) return PLACEHOLDER_PHONE
    return '+' + digits
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Initialize Supabase client
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            {
                global: {
                    headers: { Authorization: req.headers.get('Authorization')! },
                },
            }
        )

        // Initialize Admin client for privileged operations (RLS bypass)
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Parse request body
        const { event_id, quantity, tier_id, seat_ids, seat_session_id, promo_code, channel_code, guest_details, success_url, failure_url, subscribed_to_newsletter, registration_id, metadata: clientMetadata, attribution, source } = await req.json()

        // Which client created this order. Whitelisted rather than stored raw so the column
        // can't drift into 'App'/'ios'/'mobile-web' variants; anything unrecognised is stored
        // as NULL ("client did not report it") instead of being coerced to 'web', which would
        // silently mislabel app orders as web ones.
        const ALLOWED_SOURCES = ['web', 'app', 'embed', 'api']
        const orderSource = typeof source === 'string' && ALLOWED_SOURCES.includes(source) ? source : null

        // Get authenticated user (if any)
        const {
            data: { user },
        } = await supabaseClient.auth.getUser()

        // Guest Checkout Validation
        if (!user) {
            // If no user, MUST have guest details
            if (!guest_details?.email || !guest_details?.name) {
                return new Response(
                    JSON.stringify({
                        success: false,
                        error: { code: 'UNAUTHORIZED', message: 'Authentication or Guest Details required' }
                    }),
                    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
        }

        // Get user profile for customer details (only if authenticated)
        // `users` has display_name and NO phone column at all — the old
        // `.select('full_name, phone')` threw 42703 on EVERY authenticated checkout. The
        // error was swallowed (only `data` was destructured), so userProfile silently came
        // back null and every logged-in buyer was treated as nameless.
        let userProfile: { display_name: string | null } | null = null
        if (user) {
            const { data: profile, error: profileError } = await supabaseClient
                .from('users')
                .select('display_name')
                .eq('id', user.id)
                .single()
            if (profileError) console.error('Failed to load buyer profile:', profileError)
            userProfile = profile
        }

        // Validate basic input
        if (!event_id || !quantity || quantity < 1) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'Invalid event_id or quantity' }
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // --- APPROVAL GATE (server-side enforcement) ---
        const { data: gateEvent, error: gateError } = await supabaseClient
            .from('events')
            .select('require_approval, invite_only')
            .eq('id', event_id)
            .single()

        if (gateError || !gateEvent) {
            return new Response(
                JSON.stringify({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid Event' } }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (gateEvent.require_approval || gateEvent.invite_only) {
            if (!registration_id) {
                return new Response(
                    JSON.stringify({
                        success: false,
                        error: { code: 'REGISTRATION_REQUIRED', message: 'This event requires approval. Submit a registration request before purchasing.' }
                    }),
                    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const { data: reg, error: regError } = await supabaseClient
                .from('event_registrations')
                .select('id, status, event_id, user_id, guest_email')
                .eq('id', registration_id)
                .single()

            if (regError || !reg || reg.event_id !== event_id) {
                return new Response(
                    JSON.stringify({
                        success: false,
                        error: { code: 'REGISTRATION_INVALID', message: 'Registration not found for this event.' }
                    }),
                    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const ownsRegistration = user
                ? reg.user_id === user.id
                : (!!reg.guest_email && reg.guest_email.toLowerCase() === (guest_details?.email ?? '').toLowerCase())

            if (!ownsRegistration) {
                return new Response(
                    JSON.stringify({
                        success: false,
                        error: { code: 'REGISTRATION_INVALID', message: 'Registration does not match this account.' }
                    }),
                    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            if (reg.status !== 'approved') {
                const code = reg.status === 'pending'
                    ? 'REGISTRATION_PENDING'
                    : reg.status === 'rejected'
                        ? 'REGISTRATION_REJECTED'
                        : 'REGISTRATION_NOT_APPROVED'
                return new Response(
                    JSON.stringify({
                        success: false,
                        error: { code, message: `Registration is ${reg.status}. Payment is only allowed after the organizer approves.` }
                    }),
                    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
        }

        // --- PRICING LOGIC ---
        let unitPrice = 0
        let tierName = 'General Admission'
        let organizerId = null

        if (tier_id) {
            const { data: tier, error: tierError } = await supabaseClient
                .from('ticket_tiers')
                .select('price, name, quantity_sold, quantity_total, is_active, sales_start, sales_end, events(organizer_id)')
                .eq('id', tier_id)
                .eq('event_id', event_id)
                .single()

            if (tierError || !tier) {
                return new Response(JSON.stringify({ success: false, error: { message: 'Invalid Ticket Tier' } }), { status: 400, headers: corsHeaders })
            }

            // The organizer's lock. Every buyer surface hides an inactive tier and the
            // tier manager promises "Inactive tiers won't be available for purchase",
            // but this path never checked — so a locked tier stayed purchasable by
            // anyone still holding its id: a stale tab, a bookmarked checkout, the
            // embed widget, a replayed request. /api/v1/checkouts already enforced
            // this, so the two checkout paths disagreed about whether a lock meant
            // anything.
            //
            // `=== false` (not `!tier.is_active`) deliberately: NULL means "never
            // configured", which the buyer-side filters treat as active. Blocking on
            // null would silently close tiers that were only ever meant to be open.
            if (tier.is_active === false) {
                return new Response(
                    JSON.stringify({ success: false, error: { code: 'TIER_LOCKED', message: 'This ticket type is not on sale right now.' } }),
                    { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            // Scheduled window. Columns already exist and the save path accepts them
            // (no UI yet, 0 rows set), so enforcing now costs nothing today and means
            // a future "sales open/close at" picker is a pure frontend change.
            const nowMs = Date.now()
            if (tier.sales_start && new Date(tier.sales_start).getTime() > nowMs) {
                return new Response(
                    JSON.stringify({ success: false, error: { code: 'TIER_NOT_YET_ON_SALE', message: 'Sales for this ticket type have not opened yet.' } }),
                    { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
            if (tier.sales_end && new Date(tier.sales_end).getTime() < nowMs) {
                return new Response(
                    JSON.stringify({ success: false, error: { code: 'TIER_SALES_CLOSED', message: 'Sales for this ticket type have closed.' } }),
                    { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            if (tier.quantity_sold + quantity > tier.quantity_total) {
                return new Response(JSON.stringify({ success: false, error: { message: 'Selected ticket tier is sold out' } }), { status: 400, headers: corsHeaders })
            }

            unitPrice = tier.price
            tierName = tier.name
            // @ts-ignore
            organizerId = tier.events?.organizer_id
        } else {
            const { data: event, error: eventError } = await supabaseClient
                .from('events')
                .select('ticket_price, organizer_id')
                .eq('id', event_id)
                .single()

            if (eventError || !event) {
                return new Response(JSON.stringify({ success: false, error: { message: 'Invalid Event' } }), { status: 400, headers: corsHeaders })
            }
            unitPrice = event.ticket_price
            organizerId = event.organizer_id
        }

        // --- PLATFORM FEE CONFIG ---
        // Single source of truth for the take: pct% of net + fixed×qty, collected as
        // ONE inline Xendit PLATFORM fee (no split rules). The pass-fees toggle only
        // moves WHO pays it. Processing (Xendit MDR) is always absorbed by the
        // organizer (charged on their sub-wallet), never added to the customer.
        let platformFeePercentage = DEFAULT_PLATFORM_PCT
        let fixedFeePerTicket = DEFAULT_FIXED_FEE
        // Two independent pass-through toggles. Defaults mirror a brand-new partner:
        // the ₱15 booking fee is passed to the customer, the 2% commission is not.
        let passFixedToCustomer = true
        let passPercentageToCustomer = false
        let useMainWallet = false
        let organizerCardsGcashLive = false
        let partnerXenditAccountId: string | null = null
        if (organizerId) {
            const { data: partner } = await supabaseClient
                .from('partners')
                .select('custom_percentage, pass_fixed_to_customer, pass_percentage_to_customer, fixed_fee_per_ticket, xendit_account_id, use_main_wallet, xendit_cards_gcash_live')
                .eq('id', organizerId)
                .single()

            useMainWallet = partner?.use_main_wallet === true
            organizerCardsGcashLive = partner?.xendit_cards_gcash_live === true
            passFixedToCustomer = partner?.pass_fixed_to_customer === true
            passPercentageToCustomer = partner?.pass_percentage_to_customer === true
            partnerXenditAccountId = partner?.xendit_account_id ?? null
            // Use ?? (not ||) so a deliberate 0% / ₱0 is respected.
            platformFeePercentage = partner?.custom_percentage ?? DEFAULT_PLATFORM_PCT
            fixedFeePerTicket = partner?.fixed_fee_per_ticket ?? DEFAULT_FIXED_FEE
        }

        // --- PROMO CODE LOGIC ---
        let discountAmount = 0
        let promoCodeId = null

        if (promo_code) {
            const { data: promo, error: promoError } = await supabaseClient
                .from('promo_codes')
                .select('*')
                .eq('event_id', event_id)
                .eq('code', promo_code.toUpperCase())
                .eq('is_active', true)
                .single()

            if (promo) {
                const now = new Date()
                if (promo.expires_at && new Date(promo.expires_at) < now) {
                    return new Response(JSON.stringify({ success: false, error: { message: 'Promo code expired' } }), { status: 400, headers: corsHeaders })
                }
                if (promo.usage_limit && promo.usage_count >= promo.usage_limit) {
                    return new Response(JSON.stringify({ success: false, error: { message: 'Promo code usage limit reached' } }), { status: 400, headers: corsHeaders })
                }

                promoCodeId = promo.id

                const subtotal = unitPrice * quantity
                if (promo.discount_type === 'percentage') {
                    discountAmount = subtotal * (promo.discount_amount / 100)
                } else {
                    discountAmount = promo.discount_amount
                }

                if (discountAmount > subtotal) discountAmount = subtotal
            } else {
                return new Response(JSON.stringify({ success: false, error: { message: 'Invalid Promo Code' } }), { status: 400, headers: corsHeaders })
            }
        }

        const { data: intentData, error: reserveError } = await supabaseClient.rpc(
            'reserve_tickets',
            {
                p_event_id: event_id,
                p_user_id: user?.id ?? null,
                p_quantity: quantity,
                p_guest_email: guest_details?.email ?? user?.email ?? null,
                p_guest_name: guest_details?.name ?? userProfile?.display_name ?? null,
                // No phone is stored on `users` anywhere in the schema — checkout input is
                // the only source, for guests and signed-in buyers alike.
                p_guest_phone: guest_details?.phone ?? null,
            }
        )

        if (reserveError) {
            console.error('Reserve tickets error:', reserveError)
            return new Response(
                JSON.stringify({
                    success: false,
                    error: {
                        code: reserveError.message.includes('sold out') ? 'SOLD_OUT' : 'SERVER_ERROR',
                        message: reserveError.message
                    }
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const intentId = intentData

        // --- SEAT ASSIGNMENT (seated events) ---
        let assignedSeats = null
        if (tier_id) {
            const { data: seatAssignment, error: seatError } = await supabaseAdmin.rpc(
                'assign_seats_to_intent',
                {
                    p_intent_id: intentId,
                    p_tier_id: tier_id,
                    p_quantity: quantity,
                    p_seat_ids: Array.isArray(seat_ids) && seat_ids.length > 0 ? seat_ids : null,
                    // Lets the RPC confirm the buyer STILL holds these seats.
                    // Without it the checkout countdown is UI-only: the RPC can
                    // see whether someone else holds a seat, but not whether the
                    // buyer's own hold lapsed while they sat on the page.
                    p_session_id: typeof seat_session_id === 'string' && seat_session_id
                        ? seat_session_id : null,
                }
            )

            if (seatError) {
                await supabaseAdmin.from('purchase_intents').update({ status: 'failed' }).eq('id', intentId)
                await supabaseAdmin.from('tickets').update({ status: 'available' }).eq('purchase_intent_id', intentId).eq('status', 'reserved')
                console.error('Seat assignment error:', seatError)
                const code = seatError.message?.includes('SEATS_EXPIRED') ? 'SEATS_EXPIRED'
                    : seatError.message?.includes('SEATS_UNAVAILABLE') ? 'SEATS_UNAVAILABLE'
                    : seatError.message?.includes('SEAT_COUNT_MISMATCH') ? 'SEAT_COUNT_MISMATCH'
                    : 'SERVER_ERROR'
                return new Response(
                    JSON.stringify({ success: false, error: { code, message: seatError.message } }),
                    { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
            assignedSeats = seatAssignment
            if (assignedSeats) {
                console.log(`Assigned ${assignedSeats.length} seat(s) to intent ${intentId}`)
            }
        }

        // --- SUBSCRIBER DISCOUNT ---
        let subscriberDiscountAmount = 0
        let subscriberDiscountMeta: Record<string, unknown> = {}

        if (user && clientMetadata?.has_subscriber_discount === true) {
            try {
                const { data: discountResult } = await supabaseClient.rpc(
                    'get_subscriber_event_discount',
                    { p_event_id: event_id }
                )

                if (discountResult?.has_discount === true) {
                    const eligibleQty = Math.min(quantity, discountResult.max_tickets ?? 1)
                    const saving = Math.round((unitPrice - discountResult.discounted_price) * eligibleQty)
                    if (saving > 0) {
                        subscriberDiscountAmount = saving
                        subscriberDiscountMeta = {
                            applied: true,
                            saving,
                            discounted_price: discountResult.discounted_price,
                            original_price: discountResult.original_price,
                            eligible_tickets: eligibleQty,
                            tier_id: discountResult.subscription_tier_id,
                        }
                        console.log(`Subscriber discount applied: -${saving} (${eligibleQty}x tickets, tier ${discountResult.subscription_tier_id})`)
                    }
                } else if (discountResult?.has_discount === false) {
                    const fallbackSaving = Number(clientMetadata?.subscriber_saving ?? 0)
                    if (fallbackSaving > 0) {
                        subscriberDiscountAmount = fallbackSaving
                        subscriberDiscountMeta = {
                            applied: true,
                            saving: fallbackSaving,
                            fallback: true,
                        }
                        console.log(`Subscriber discount fallback (sub lapsed): -${fallbackSaving}`)
                    }
                }
            } catch (e) {
                console.warn('Subscriber discount check failed (non-fatal):', e)
            }
        }

        // --- PLATFORM TAKE + ORDER TOTAL ---
        // take = pct% of net + fixed×qty, charged in BOTH modes (the toggle only moves
        // who pays it). Computed on the post-discount net so the checkout UI and this
        // Xendit fee never drift.
        const subtotal = unitPrice * quantity
        const totalDiscount = discountAmount + subscriberDiscountAmount
        const net = Math.max(subtotal - totalDiscount, 0)
        // Split the take: pct portion (2%) + fixed portion (₱15×qty). fixed×qty is a
        // whole number, so rounding the pct alone == rounding the two together.
        const pctTake = net > 0 ? Math.round(net * (platformFeePercentage / 100)) : 0
        const fixedTake = net > 0 ? Math.round(fixedFeePerTicket * quantity) : 0
        // Full HangHut take — always our revenue and always the inline PLATFORM fee,
        // no matter who fronts it. Stored on the intent as the source of truth.
        const platformTake = pctTake + fixedTake
        const platformFee = platformTake
        // Each component is added to the buyer's bill only if its toggle is on; the
        // rest is absorbed from the organizer's payout (webhook derives that from
        // total_amount − take). So total = net + (whichever portions are passed).
        const passedPortion =
            (passPercentageToCustomer ? pctTake : 0) + (passFixedToCustomer ? fixedTake : 0)
        const totalAmount = net + passedPortion

        const feeMetadata: Record<string, unknown> = passedPortion > 0
            ? {
                pass_fees: true,
                pass_percentage: passPercentageToCustomer,
                pass_fixed: passFixedToCustomer,
                platform_fee: platformTake,
                passed_fee: passedPortion,
                fixed_fee: fixedTake,
                platform_pct: platformFeePercentage,
                base_price: net,
            }
            : {}

        console.log(`Updating Intent ${intentId}: Tier=${tierName}, Net=${net}, Take=${platformTake} (pct=${pctTake},fixed=${fixedTake}), Passed=${passedPortion} (pct=${passPercentageToCustomer},fixed=${passFixedToCustomer}), Total=${totalAmount}`)

        const combinedMetadata = {
            ...(Object.keys(feeMetadata).length > 0 ? feeMetadata : {}),
            ...(Object.keys(subscriberDiscountMeta).length > 0 ? { subscriber_discount: subscriberDiscountMeta } : {}),
        }

        const { error: updateError } = await supabaseAdmin
            .from('purchase_intents')
            .update({
                tier_id: tier_id ?? null,
                promo_code_id: promoCodeId,
                unit_price: unitPrice,
                subtotal: subtotal,
                discount_amount: totalDiscount,
                platform_fee: platformFee,
                total_amount: totalAmount,
                pricing_note: `Tier: ${tierName}${promo_code ? ' | Promo: ' + promo_code : ''}${subscriberDiscountAmount > 0 ? ' | Subscriber discount: -' + subscriberDiscountAmount : ''}`,
                fee_percentage: platformFeePercentage,
                subscribed_to_newsletter: subscribed_to_newsletter ?? false,
                attribution: attribution && typeof attribution === 'object' ? attribution : null,
                source: orderSource,
                metadata: Object.keys(combinedMetadata).length > 0 ? combinedMetadata : null
            })
            .eq('id', intentId)

        if (updateError) {
            console.error('Failed to update intent pricing:', updateError)
            throw new Error('Failed to update intent pricing details')
        }

        const { data: intent, error: fetchError } = await supabaseAdmin
            .from('purchase_intents')
            .select('*, event:events(*)')
            .eq('id', intentId)
            .single()

        if (fetchError || !intent) {
            throw new Error('Failed to fetch purchase intent')
        }

        // --- FREE EVENT SHORT-CIRCUIT ---
        if (Math.round(Number(intent.total_amount)) === 0) {
            console.log(`Free event -- short-circuiting Xendit for intent ${intentId}`)

            await supabaseAdmin
                .from('purchase_intents')
                .update({
                    status: 'completed',
                    paid_at: new Date().toISOString(),
                    payment_method: 'FREE',
                })
                .eq('id', intentId)

            const { data: tickets, error: issueError } = await supabaseAdmin.rpc(
                'issue_tickets',
                {
                    p_intent_id: intentId,
                    p_registration_id: registration_id ?? intent.metadata?.registration_id ?? null,
                }
            )

            if (issueError) {
                console.error('Failed to issue free tickets:', issueError)
                throw new Error(`Failed to issue free tickets: ${issueError.message}`)
            }

            const recipientEmail = user?.email || guest_details?.email
            const recipientName = user
                ? (userProfile?.display_name ?? null)
                : (guest_details?.name ?? null)

            if (recipientEmail && Array.isArray(tickets) && tickets.length > 0) {
                const { error: queueError } = await supabaseAdmin.rpc('pgmq_send', {
                    queue_name: 'payment_side_effects',
                    message: {
                        type: 'send_ticket_email',
                        data: {
                            email: recipientEmail,
                            name: recipientName,
                            event_title: intent.event?.title || 'Event',
                            event_venue: intent.event?.venue_name || 'Venue',
                            event_date: intent.event?.start_datetime,
                            event_end_date: intent.event?.end_datetime,
                            event_cover_image: intent.event?.cover_image_url,
                            ticket_quantity: quantity,
                            total_amount: 0,
                            transaction_ref: intent.xendit_external_id || intentId,
                            payment_method: 'FREE',
                            tickets,
                        },
                    },
                })
                if (queueError) {
                    console.error('Failed to enqueue free ticket email:', queueError)
                }
            }

            return new Response(
                JSON.stringify({
                    success: true,
                    data: {
                        intent_id: intentId,
                        free: true,
                        total_amount: 0,
                        tickets_reserved: quantity,
                        tier_name: tierName,
                        assigned_seats: assignedSeats,
                        event: {
                            title: intent.event?.title,
                            start_datetime: intent.event?.start_datetime,
                        },
                    },
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Create Xendit Payment Session (Hosted Checkout)
        const xenditKey = Deno.env.get('XENDIT_SECRET_KEY')
        if (!xenditKey) {
            throw new Error('XENDIT_SECRET_KEY not configured')
        }

        // Single platform fee — the whole take (pct + fixed). No split rules.
        const hanghutTake = platformTake

        const sessionBody = {
            reference_id: intent.xendit_external_id,
            session_type: 'PAY',
            mode: 'PAYMENT_LINK',
            amount: Math.round(intent.total_amount),
            currency: 'PHP',
            country: 'PH',
            // QRPH routes through main wallet for all accounts
            allowed_payment_channels: [
                'QRPH',
                ...(useMainWallet || organizerCardsGcashLive ? ['CARDS', 'GCASH'] : []),
                'PAYMAYA',
                'GRABPAY',
                'BPI_DIRECT_DEBIT',
                'UBP_DIRECT_DEBIT',
                'RCBC_DIRECT_DEBIT',
            ],
            ...(organizerId && hanghutTake > 0 && !useMainWallet ? {
                fees: [{ type: 'PLATFORM', value: hanghutTake }]
            } : {}),
            customer: {
                reference_id: (user?.id ? `${user.id}_${Date.now()}` : `guest_${intent.id}_${Date.now()}`),
                type: 'INDIVIDUAL',
                email: user?.email || guest_details?.email || 'customer@example.com',
                // Was `user ? userProfile?.phone : guest_details?.phone` — and since no phone
                // column exists, a signed-in buyer ALWAYS fell through to the dummy number.
                // Checkout collects one from everyone, so use it in both cases.
                // Normalised: a space or dash in the number was a hard 400 from Xendit.
                mobile_number: toE164PH(guest_details?.phone),
                individual_detail: {
                    given_names: user ? (userProfile?.display_name?.split(' ')[0] || 'Customer') : (guest_details?.name?.split(' ')[0] || 'Guest'),
                    surname: (user ? (userProfile?.display_name?.split(' ').slice(1).join(' ')) : (guest_details?.name?.split(' ').slice(1).join(' '))) || '-',
                },
            },
            description: `${quantity}x ${tierName} for ${intent.event.title}`,
            success_return_url: success_url || undefined,
            cancel_return_url: failure_url || undefined,
            metadata: {
                event_id: event_id,
                intent_id: intentId,
                user_id: user?.id || 'guest',
                is_guest: String(!user),
                tier_id: tier_id || 'default',
                promo_code: promo_code || ''
            },
        }

        console.log('Creating Xendit Payment Session:', JSON.stringify(sessionBody))

        const headers = new Headers()
        headers.set('Authorization', `Basic ${btoa(xenditKey + ':')}`)
        headers.set('Content-Type', 'application/json')

        // Route the settlement to the partner's sub-account. The platform fee is the
        // single inline PLATFORM fee above — split rules are intentionally NOT used
        // (a static split rule can't do a per-ticket flat fee, and stacking it with
        // the inline fee double-charged the percentage).
        if (organizerId && !useMainWallet && partnerXenditAccountId) {
            headers.set('for-user-id', partnerXenditAccountId)
            console.log(`XenPlatform: routing to sub-account ${partnerXenditAccountId}, platform fee ${hanghutTake}`)
        } else if (useMainWallet) {
            console.log(`Main wallet: first-party event ${event_id} settles directly to main account`)
        }

        const xenditResponse = await fetch('https://api.xendit.co/sessions', {
            method: 'POST',
            headers,
            body: JSON.stringify(sessionBody),
        })

        const xenditRawBody = await xenditResponse.text()
        console.log(`Xendit response status: ${xenditResponse.status}`)
        console.log(`Xendit response body: ${xenditRawBody}`)

        if (!xenditResponse.ok) {
            // Save Xendit error to intent metadata for debugging
            let parsedXenditError: unknown = xenditRawBody
            try { parsedXenditError = JSON.parse(xenditRawBody) } catch { /* keep raw string */ }

            await supabaseAdmin
                .from('purchase_intents')
                .update({
                    status: 'failed',
                    metadata: { ...combinedMetadata, xendit_error: parsedXenditError, xendit_status: xenditResponse.status }
                })
                .eq('id', intentId)

            // Release the reserved inventory back to the pool. This branch used to
            // skip it, so a payment-provider failure left its tickets 'reserved'
            // forever: expire_stale_purchase_intents only sweeps intents still
            // 'pending', and this intent is now 'failed', so nothing ever reclaimed
            // them. On prod that leaked 34 seats out of KOOLCHELLA's allocation.
            await supabaseAdmin
                .from('tickets')
                .update({ status: 'available', user_id: null, purchase_intent_id: null })
                .eq('purchase_intent_id', intentId)
                .eq('status', 'reserved')

            // The SEAT too, for the same reason. assign_seats_to_intent parked a
            // seat_holds row keyed by the intent id with an 18-minute TTL — long
            // deliberately, so a LIVE checkout is never cut off mid-payment. This
            // checkout is not live; it just died at the payment provider. Without
            // this the ticket went back on sale while the seat stayed dark for the
            // full 18 minutes, and on a map where one section is one couch that
            // reads as a whole section sold out for a quarter of an hour.
            //
            // expire_stale_purchase_intents does the same release for ABANDONED
            // intents, but only ever sees rows still 'pending' — this one is now
            // 'failed', so nothing else would ever reclaim the seat.
            await supabaseAdmin
                .from('seat_holds')
                .delete()
                .eq('session_id', intentId)

            // events.tickets_sold is NOT touched here. trg_sync_event_tickets_sold
            // decrements it from the ticket rows released above. The old explicit
            // `tickets_sold - quantity` was a second, uncoordinated writer AND a
            // read-modify-write off a stale snapshot — under concurrent failures
            // (exactly what an on-sale rush produces) the writes raced and the
            // counter drifted away from the ticket table.

            throw new Error(`Payment provider error: ${xenditRawBody}`)
        }

        const session = JSON.parse(xenditRawBody)
        console.log('Xendit Payment Session created:', session)

        await supabaseAdmin
            .from('purchase_intents')
            .update({
                xendit_invoice_id: session.id,
                xendit_invoice_url: session.payment_link_url,
                payment_method: 'multiple',
            })
            .eq('id', intentId)

        return new Response(
            JSON.stringify({
                success: true,
                data: {
                    intent_id: intentId,
                    payment_request_id: session.id,
                    subtotal: intent.subtotal,
                    discount_amount: intent.discount_amount,
                    platform_fee: intent.platform_fee,
                    total_amount: intent.total_amount,
                    payment_url: session.payment_link_url,
                    expires_at: intent.expires_at,
                    tickets_reserved: quantity,
                    tier_name: tierName,
                    assigned_seats: assignedSeats,
                    event: {
                        title: intent.event.title,
                        start_datetime: intent.event.start_datetime,
                    },
                },
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Create purchase intent error:', error)
        return new Response(
            JSON.stringify({
                success: false,
                error: { message: error.message || 'Internal Server Error' }
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
