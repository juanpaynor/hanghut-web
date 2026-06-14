'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { calculatePlatformFee } from './fees'
import { getPartnerMonthlyRevenue } from './access'

// ─────────────────────────────────────────────
// CHECKOUT
// ─────────────────────────────────────────────

/**
 * Delegates to the create-subscription-checkout edge function which holds
 * PAYREX_SECRET and PAYREX_API. Returns {client_secret, public_key} for
 * Payrex.js — no PayRex keys needed in Vercel.
 */
export async function initiateSubscriptionCheckout(tierId: string) {
    const supabase = await createClient()

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { error: 'Not authenticated' }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const res = await fetch(`${supabaseUrl}/functions/v1/create-subscription-checkout`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ tier_id: tierId }),
    })

    const data = await res.json()
    if (!res.ok) return { error: data.error ?? 'Checkout failed' }

    return {
        success: true as const,
        client_secret: data.client_secret as string,
        public_key: data.public_key as string,
    }
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

    // Fire welcome / renewal email — failure does not block provisioning
    try {
        const { data: tierData } = await adminClient
            .from('subscription_tiers')
            .select('name, perks, partners!inner(business_name, slug)')
            .eq('id', params.tierId)
            .single()

        if (tierData) {
            const partner = tierData.partners as any
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
            const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

            await fetch(`${supabaseUrl}/functions/v1/send-subscription-welcome`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${serviceRoleKey}`,
                },
                body: JSON.stringify({
                    fan_id: params.fanId,
                    tier_name: tierData.name,
                    partner_name: partner.business_name,
                    partner_slug: partner.slug,
                    price_monthly: params.amount,
                    current_period_end: periodEnd,
                    perks: tierData.perks || [],
                    is_renewal: !!params.existingSubId,
                }),
            })
        }
    } catch {
        // Email failure is non-fatal
    }
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
    type: 'gated_posts' | 'early_access' | 'digital_download' | 'community_link' | 'merch' | 'shoutout' | 'subscriber_chat' | 'custom'
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

    // If subscriber_chat perk is included, provision the subscriber group
    if (data.perks?.some(p => p.type === 'subscriber_chat')) {
        const adminClient = createAdminClient()
        const { data: group } = await adminClient
            .from('groups')
            .insert({
                name: `${data.name.trim()} Members`,
                group_type: 'subscriber',
                subscription_tier_id: tier.id,
                privacy: 'private',
                created_by: user.id,
            })
            .select('id')
            .single()

        if (group) {
            await adminClient.from('group_members').insert({
                group_id: group.id,
                user_id: user.id,
                role: 'admin',
                status: 'approved',
            })
        }
    }

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

    // If subscriber_chat perk is being set, ensure the subscriber group exists
    if (data.perks?.some(p => p.type === 'subscriber_chat')) {
        const adminClient = createAdminClient()
        const { data: existingGroup } = await adminClient
            .from('groups')
            .select('id')
            .eq('subscription_tier_id', tierId)
            .eq('group_type', 'subscriber')
            .maybeSingle()

        if (!existingGroup) {
            const tierName = data.name?.trim() || tierId
            const { data: group } = await adminClient
                .from('groups')
                .insert({
                    name: `${tierName} Members`,
                    group_type: 'subscriber',
                    subscription_tier_id: tierId,
                    privacy: 'private',
                    created_by: user.id,
                })
                .select('id')
                .single()

            if (group) {
                await adminClient.from('group_members').insert({
                    group_id: group.id,
                    user_id: user.id,
                    role: 'admin',
                    status: 'approved',
                })
            }
        }
    }

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
