'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { payrex } from './payrex'
import { calculatePlatformFee } from './fees'
import { getPartnerMonthlyRevenue } from './access'

// ─────────────────────────────────────────────
// CHECKOUT
// ─────────────────────────────────────────────

export async function initiateSubscriptionCheckout(tierId: string) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    // Fetch tier + partner
    const { data: tier } = await supabase
        .from('subscription_tiers')
        .select('id, name, price_monthly, is_active, partner_id, partners(business_name, kyc_status, verified)')
        .eq('id', tierId)
        .single()

    if (!tier) return { error: 'Tier not found' }
    if (!tier.is_active) return { error: 'This tier is no longer available' }

    const partner = tier.partners as any
    if (!partner?.verified || partner?.kyc_status !== 'verified') {
        return { error: 'This organizer is not yet verified' }
    }

    // Block if fan already has an active sub to this partner
    const { data: existing } = await supabase
        .from('fan_subscriptions')
        .select('id, status')
        .eq('fan_id', user.id)
        .eq('partner_id', tier.partner_id)
        .maybeSingle()

    if (existing && (existing.status === 'active' || existing.status === 'grace_period')) {
        return { error: 'You already have an active subscription to this organizer' }
    }

    // Fee calculation
    const monthlyRevenue = await getPartnerMonthlyRevenue(tier.partner_id)
    const platformFee = calculatePlatformFee(tier.price_monthly, monthlyRevenue)

    // Create Payrex checkout (mock auto-approves)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:9002'
    const result = await payrex.createCheckout({
        amount: tier.price_monthly,
        description: `${partner.business_name} — ${tier.name} (monthly)`,
        successUrl: `${baseUrl}/subscriptions/success`,
        failureUrl: `${baseUrl}/${tier.partner_id}`,
        metadata: {
            tier_id: tierId,
            partner_id: tier.partner_id,
            fan_id: user.id,
            platform_fee: String(platformFee),
        },
    })

    // Mock: since Payrex auto-approves, provision immediately
    if (result.status === 'paid') {
        await provisionSubscription({
            fanId: user.id,
            tierId,
            partnerId: tier.partner_id,
            amount: tier.price_monthly,
            platformFee,
            payrexRef: result.payrex_ref,
            existingSubId: existing?.id,
        })

        revalidatePath(`/${tier.partner_id}`)
        return { success: true, checkoutUrl: result.checkout_url }
    }

    return { success: true, checkoutUrl: result.checkout_url }
}

// ─────────────────────────────────────────────
// PROVISION (called by checkout + webhook)
// ─────────────────────────────────────────────

async function provisionSubscription(params: {
    fanId: string
    tierId: string
    partnerId: string
    amount: number
    platformFee: number
    payrexRef: string
    existingSubId?: string
}) {
    const adminClient = createAdminClient()

    const now = new Date()
    const periodStart = now.toISOString()
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString()

    let subscriptionId: string

    if (params.existingSubId) {
        // Renewal — update existing row
        const { data } = await adminClient
            .from('fan_subscriptions')
            .update({
                tier_id: params.tierId,
                status: 'active',
                current_period_start: periodStart,
                current_period_end: periodEnd,
                payrex_ref: params.payrexRef,
                cancelled_at: null,
                updated_at: now.toISOString(),
            })
            .eq('id', params.existingSubId)
            .select('id')
            .single()

        subscriptionId = data!.id
    } else {
        // New subscription
        const { data } = await adminClient
            .from('fan_subscriptions')
            .insert({
                fan_id: params.fanId,
                tier_id: params.tierId,
                partner_id: params.partnerId,
                status: 'active',
                current_period_start: periodStart,
                current_period_end: periodEnd,
                payrex_ref: params.payrexRef,
            })
            .select('id')
            .single()

        subscriptionId = data!.id
    }

    // Log payment
    await adminClient.from('subscription_payments').insert({
        subscription_id: subscriptionId,
        fan_id: params.fanId,
        partner_id: params.partnerId,
        amount: params.amount,
        platform_fee: params.platformFee,
        payrex_ref: params.payrexRef,
        status: 'paid',
        billing_period_start: periodStart,
        billing_period_end: periodEnd,
    })
}

// ─────────────────────────────────────────────
// CANCEL
// ─────────────────────────────────────────────

export async function cancelSubscription(subscriptionId: string) {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { data: sub } = await supabase
        .from('fan_subscriptions')
        .select('id, fan_id, partner_id, status, current_period_end')
        .eq('id', subscriptionId)
        .eq('fan_id', user.id)
        .single()

    if (!sub) return { error: 'Subscription not found' }
    if (sub.status === 'cancelled' || sub.status === 'expired') {
        return { error: 'Subscription is already cancelled' }
    }

    await adminClient
        .from('fan_subscriptions')
        .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', subscriptionId)

    revalidatePath('/organizer/subscriptions')
    return { success: true, accessUntil: sub.current_period_end }
}

// ─────────────────────────────────────────────
// TIER MANAGEMENT (organizer)
// ─────────────────────────────────────────────

export interface PerkItem {
    type: 'gated_posts' | 'early_access' | 'digital_download' | 'community_link' | 'merch' | 'shoutout' | 'custom'
    label: string
    description?: string
    url?: string           // external URL (Google Drive, Discord invite, etc.)
    file_path?: string     // Supabase Storage path in subscription-downloads bucket
    claim_frequency?: 'once' | 'monthly' | 'unlimited'
}

export async function createSubscriptionTier(data: {
    name: string
    description: string
    price_monthly: number
    image_url?: string
    long_description?: string
    perks?: PerkItem[]
}) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { data: partner } = await supabase
        .from('partners')
        .select('id, kyc_status, verified')
        .eq('user_id', user.id)
        .single()

    if (!partner) return { error: 'Partner account not found' }
    if (!partner.verified || partner.kyc_status !== 'verified') {
        return { error: 'Your account must be KYC-verified to create subscription tiers' }
    }

    if (!data.name?.trim()) return { error: 'Tier name is required' }
    if (!data.price_monthly || data.price_monthly <= 0) return { error: 'Price must be greater than ₱0' }

    const { data: tier, error } = await supabase
        .from('subscription_tiers')
        .insert({
            partner_id: partner.id,
            name: data.name.trim(),
            description: data.description?.trim() || null,
            price_monthly: data.price_monthly,
            image_url: data.image_url || null,
            long_description: data.long_description || null,
            perks: data.perks || [],
        })
        .select()
        .single()

    if (error) return { error: error.message }

    revalidatePath('/organizer/subscriptions')
    return { success: true as const, tier: tier as any }
}

export async function updateSubscriptionTier(tierId: string, data: {
    name?: string
    description?: string
    price_monthly?: number
    is_active?: boolean
    image_url?: string
    long_description?: string
    perks?: PerkItem[]
}) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { error } = await supabase
        .from('subscription_tiers')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', tierId)

    if (error) return { error: error.message }

    revalidatePath('/organizer/subscriptions')
    return { success: true }
}

// ─────────────────────────────────────────────
// SUBSCRIPTION POSTS (organizer)
// ─────────────────────────────────────────────

export async function createSubscriptionPost(data: {
    tier_id: string
    title: string
    body: string
    image_url?: string
    gated_url?: string
    gated_url_label?: string
    publish: boolean
}) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .single()

    if (!partner) return { error: 'Partner account not found' }

    const { data: post, error } = await supabase
        .from('subscription_posts')
        .insert({
            partner_id: partner.id,
            tier_id: data.tier_id,
            title: data.title.trim(),
            body: data.body.trim(),
            image_url: data.image_url || null,
            gated_url: data.gated_url || null,
            gated_url_label: data.gated_url_label || null,
            published_at: data.publish ? new Date().toISOString() : null,
        })
        .select()
        .single()

    if (error) return { error: error.message }

    revalidatePath('/organizer/subscriptions/posts')
    return { success: true, post }
}

export async function deleteSubscriptionPost(postId: string) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { error } = await supabase
        .from('subscription_posts')
        .delete()
        .eq('id', postId)

    if (error) return { error: error.message }

    revalidatePath('/organizer/subscriptions/posts')
    return { success: true }
}

// ─────────────────────────────────────────────
// EVENT SUBSCRIPTION DISCOUNTS (organizer)
// ─────────────────────────────────────────────

export async function upsertEventDiscount(
    eventId: string,
    subscriptionTierId: string,
    discountType: 'fixed_price' | 'percentage',
    discountValue: number,
    maxTickets: number = 1
) {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .single()

    if (!partner) return { error: 'Partner account not found' }

    // Ownership check — verify event belongs to this partner
    const { data: event } = await supabase
        .from('events')
        .select('id')
        .eq('id', eventId)
        .eq('organizer_id', partner.id)
        .single()

    if (!event) return { error: 'Event not found or access denied' }

    if (discountValue <= 0) return { error: 'Discount value must be greater than 0' }
    if (discountType === 'percentage' && discountValue > 100) return { error: 'Percentage discount cannot exceed 100%' }
    if (maxTickets < 1) return { error: 'Max tickets must be at least 1' }

    const { error } = await adminClient
        .from('event_subscription_discounts')
        .upsert({
            event_id: eventId,
            subscription_tier_id: subscriptionTierId,
            discount_type: discountType,
            discount_value: discountValue,
            max_tickets: maxTickets,
        }, { onConflict: 'event_id,subscription_tier_id' })

    if (error) return { error: error.message }

    revalidatePath(`/organizer/events/${eventId}`)
    return { success: true as const }
}

export async function deleteEventDiscount(eventId: string, subscriptionTierId: string) {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .single()

    if (!partner) return { error: 'Partner account not found' }

    // Ownership check
    const { data: event } = await supabase
        .from('events')
        .select('id')
        .eq('id', eventId)
        .eq('organizer_id', partner.id)
        .single()

    if (!event) return { error: 'Event not found or access denied' }

    const { error } = await adminClient
        .from('event_subscription_discounts')
        .delete()
        .eq('event_id', eventId)
        .eq('subscription_tier_id', subscriptionTierId)

    if (error) return { error: error.message }

    revalidatePath(`/organizer/events/${eventId}`)
    return { success: true as const }
}

// ─────────────────────────────────────────────
// CLAIMS (organizer fulfilment)
// ─────────────────────────────────────────────

export async function updateClaimStatus(
    claimId: string,
    status: 'fulfilled' | 'rejected' | 'pending',
    note?: string
) {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    // Resolve the caller's partner account
    const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .single()

    if (!partner) return { error: 'Partner account not found' }

    // Explicit ownership check — the claim must belong to THIS partner.
    // RLS updates can fail silently, so we verify ownership ourselves and
    // perform the write with the admin client (mirrors approveRegistration).
    const { data: claim } = await supabase
        .from('subscription_claims')
        .select('id, partner_id')
        .eq('id', claimId)
        .single()

    if (!claim) return { error: 'Claim not found' }
    if (claim.partner_id !== partner.id) return { error: 'You do not have access to this claim' }

    const { error } = await adminClient
        .from('subscription_claims')
        .update({
            status,
            organizer_note: note?.trim() || null,
            fulfilled_at: status === 'fulfilled' ? new Date().toISOString() : null,
        })
        .eq('id', claimId)

    if (error) return { error: error.message }

    revalidatePath('/organizer/subscriptions/claims')
    return { success: true as const }
}
