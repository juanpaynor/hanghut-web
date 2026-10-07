'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type DiscountType = 'percentage' | 'fixed_amount'

export interface PromoCode {
    id: string
    code: string
    discount_type: DiscountType
    discount_amount: number
    usage_limit: number | null
    usage_count: number
    starts_at: string
    expires_at: string | null
    is_active: boolean
    app_only: boolean
}

export async function getPromoCodes(eventId: string) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { data, error } = await supabase
        .from('promo_codes')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching promo codes:', error)
        return { error: 'Failed to fetch promo codes' }
    }

    return { data: data as PromoCode[] }
}

export async function createPromoCode(eventId: string, formData: FormData) {
    const supabase = await createClient()

    const code = formData.get('code') as string
    const discount_type = formData.get('discount_type') as DiscountType
    const discount_amount = parseFloat(formData.get('discount_amount') as string)
    const usage_limit_raw = formData.get('usage_limit') as string
    const expires_at_raw = formData.get('expires_at') as string
    const app_only = formData.get('app_only') === 'true'

    if (!code || code.length < 3) {
        return { error: 'Code must be at least 3 characters' }
    }
    if (discount_amount <= 0) {
        return { error: 'Discount amount must be positive' }
    }
    if (discount_type === 'percentage' && discount_amount > 100) {
        return { error: 'Percentage cannot exceed 100%' }
    }

    const { error } = await supabase
        .from('promo_codes')
        .insert({
            event_id: eventId,
            code: code.toUpperCase().trim(),
            discount_type,
            discount_amount,
            usage_limit: usage_limit_raw ? parseInt(usage_limit_raw) : null,
            expires_at: expires_at_raw || null,
            is_active: true,
            app_only,
        })

    if (error) {
        console.error('Error creating promo code:', error)
        if (error.code === '23505') { // Unique violation
            return { error: 'This code already exists for this event' }
        }
        return { error: 'Failed to create promo code' }
    }

    revalidatePath(`/organizer/events/${eventId}`)
    return { success: true }
}

export async function togglePromoCode(codeId: string, isActive: boolean, eventId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('promo_codes')
        .update({ is_active: isActive })
        .eq('id', codeId)

    if (error) {
        console.error('Error toggling promo code:', error)
        return { error: 'Failed to update status' }
    }

    revalidatePath(`/organizer/events/${eventId}`)
    return { success: true }
}

/**
 * Edit an existing code.
 *
 * `code` itself is only editable while the code has never been redeemed. Once
 * it has, the string is out in the world -- on a poster, in a DM, in somebody's
 * notes -- and renaming it silently breaks every copy. The discount, limit,
 * expiry and app-only flag stay editable forever: past orders stored their own
 * `discount_amount` on the purchase_intent, so changing it here never
 * re-prices anything already sold.
 */
export async function updatePromoCode(codeId: string, eventId: string, formData: FormData) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const code = (formData.get('code') as string | null)?.toUpperCase().trim() ?? ''
    const discount_type = formData.get('discount_type') as DiscountType
    const discount_amount = parseFloat(formData.get('discount_amount') as string)
    const usage_limit_raw = formData.get('usage_limit') as string
    const expires_at_raw = formData.get('expires_at') as string
    const app_only = formData.get('app_only') === 'true'

    if (!(discount_amount > 0)) {
        return { error: 'Discount amount must be positive' }
    }
    if (discount_type === 'percentage' && discount_amount > 100) {
        return { error: 'Percentage cannot exceed 100%' }
    }

    const { data: existing } = await supabase
        .from('promo_codes')
        .select('code, usage_count')
        .eq('id', codeId)
        .single()

    if (!existing) return { error: 'Promo code not found' }

    const usage_limit = usage_limit_raw ? parseInt(usage_limit_raw) : null
    // A limit under what has already been redeemed renders as "Limit Reached"
    // and reads like a bug. Setting it EQUAL to usage_count is the legitimate
    // way to stop a code mid-flight, so only below is refused.
    if (usage_limit !== null && usage_limit < existing.usage_count) {
        return {
            error: `Usage limit cannot be below the ${existing.usage_count} already redeemed. `
                 + `Set it to ${existing.usage_count} to stop the code, or switch it off.`,
        }
    }

    const renaming = code && code !== existing.code
    if (renaming && existing.usage_count > 0) {
        return { error: 'This code has been used, so its name is locked. Create a new code instead.' }
    }
    if (renaming && code.length < 3) {
        return { error: 'Code must be at least 3 characters' }
    }

    // RLS decides whether this caller owns the code. PostgREST reports no error
    // when a policy simply matches no rows, so the update is asked to return the
    // row -- an empty result is a denial, not a success.
    const { data: updated, error } = await supabase
        .from('promo_codes')
        .update({
            ...(renaming ? { code } : {}),
            discount_type,
            discount_amount,
            usage_limit,
            expires_at: expires_at_raw || null,
            app_only,
        })
        .eq('id', codeId)
        .eq('event_id', eventId)
        .select('id')

    if (error) {
        console.error('Error updating promo code:', error)
        if (error.code === '23505') {
            return { error: 'This code already exists for this event' }
        }
        return { error: 'Failed to update promo code' }
    }
    if (!updated || updated.length === 0) {
        return { error: 'Not authorized to edit this promo code' }
    }

    revalidatePath(`/organizer/events/${eventId}`)
    return { success: true }
}

export async function deletePromoCode(codeId: string, eventId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('promo_codes')
        .delete()
        .eq('id', codeId)

    if (error) {
        console.error('Error deleting promo code:', error)
        // purchase_intents.promo_code_id is ON DELETE NO ACTION, so a code that
        // has ever been attached to an order cannot be removed -- the orders are
        // the reason, and they are worth more than the row. Say so, instead of
        // the bare 'Failed to delete' that left organizers with no idea why.
        if (error.code === '23503') {
            return {
                error: 'This code has been used on real orders, so deleting it would '
                     + 'break their history. Switch it off instead, or edit it.',
            }
        }
        return { error: 'Failed to delete promo code' }
    }

    revalidatePath(`/organizer/events/${eventId}`)
    return { success: true }
}

export async function validatePromoCode(eventId: string, code: string, subtotal: number) {
    const supabase = await createClient()

    // 1. Fetch code (we can use our RLS or restricted query)
    // Using service role might be safer to avoid exposing all columns if public RLS isn't perfect,
    // but for now standard client is fine if RLS "Public can view active" is set.
    // Actually, let's use standard client as it allows public read on active codes.

    const { data: promo, error } = await supabase
        .from('promo_codes')
        .select('*')
        .eq('event_id', eventId)
        .eq('code', code.toUpperCase().trim())
        .eq('is_active', true)
        .single()

    if (error || !promo) {
        return { error: 'Invalid promo code' }
    }

    // 1b. Block app-only codes from web checkout
    if (promo.app_only) {
        return { error: 'APP_ONLY', appOnly: true }
    }
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
        return { error: 'Promo code has expired' }
    }

    // 3. Check Usage Limit
    if (promo.usage_limit && promo.usage_count >= promo.usage_limit) {
        return { error: 'Promo code usage limit reached' }
    }

    // 4. Calculate Discount
    let discountAmount = 0
    if (promo.discount_type === 'percentage') {
        discountAmount = (subtotal * promo.discount_amount) / 100
    } else {
        discountAmount = promo.discount_amount
    }

    // Ensure we don't discount more than the subtotal
    discountAmount = Math.min(discountAmount, subtotal)

    return {
        success: true,
        code: promo.code,
        discountAmount: discountAmount,
        finalAmount: subtotal - discountAmount,
        promoId: promo.id
    }
}

/* ── Experiences ────────────────────────────────────────────────────────────
 *
 * A promo code targets an event OR an experience, never both — the
 * promo_codes_one_target constraint enforces that in the database. These
 * mirror the event functions rather than adding a branch to each: the column,
 * the uniqueness error and the path to revalidate all differ, and threading a
 * "kind" flag through every one of them made each function harder to read than
 * the pair it replaced.
 */

export async function getExperiencePromoCodes(experienceId: string) {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('promo_codes')
        .select('*')
        .eq('experience_id', experienceId)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching experience promo codes:', error)
        return { data: [] as PromoCode[], error: 'Failed to load promo codes' }
    }
    return { data: (data ?? []) as PromoCode[], error: null }
}

export async function createExperiencePromoCode(experienceId: string, formData: FormData) {
    const supabase = await createClient()

    const code = formData.get('code') as string
    const discount_type = formData.get('discount_type') as DiscountType
    const discount_amount = parseFloat(formData.get('discount_amount') as string)
    const usage_limit_raw = formData.get('usage_limit') as string
    const expires_at_raw = formData.get('expires_at') as string
    const app_only = formData.get('app_only') === 'true'

    if (!code || code.length < 3) return { error: 'Code must be at least 3 characters' }
    if (!(discount_amount > 0)) return { error: 'Discount amount must be positive' }
    if (discount_type === 'percentage' && discount_amount > 100) {
        return { error: 'Percentage cannot exceed 100%' }
    }

    const { error } = await supabase
        .from('promo_codes')
        .insert({
            experience_id: experienceId,
            event_id: null,
            code: code.toUpperCase().trim(),
            discount_type,
            discount_amount,
            usage_limit: usage_limit_raw ? parseInt(usage_limit_raw) : null,
            expires_at: expires_at_raw || null,
            is_active: true,
            app_only,
        })

    if (error) {
        console.error('Error creating experience promo code:', error)
        if (error.code === '23505') {
            return { error: 'This code already exists for this experience' }
        }
        return { error: 'Failed to create promo code' }
    }

    revalidatePath(`/organizer/experiences/${experienceId}/edit`)
    return { success: true }
}

export async function toggleExperiencePromoCode(
    codeId: string,
    isActive: boolean,
    experienceId: string
) {
    const supabase = await createClient()
    const { error } = await supabase
        .from('promo_codes').update({ is_active: isActive }).eq('id', codeId)

    if (error) {
        console.error('Error toggling experience promo code:', error)
        return { error: 'Failed to update status' }
    }
    revalidatePath(`/organizer/experiences/${experienceId}/edit`)
    return { success: true }
}

/**
 * Experience twin of updatePromoCode.
 *
 * NOTE: no experience promo code has ever existed on prod, and it is not for
 * want of trying -- both "manage" policies on promo_codes filter on
 * `event_id IN (...)`, and for an experience code event_id is NULL, so the
 * predicate is NULL and never true. createExperiencePromoCode() cannot insert
 * and this cannot update until a policy covering experience_id exists. Written
 * as the twin so the pair stays symmetrical; it fails closed ("Not authorized")
 * rather than silently reporting success.
 */
export async function updateExperiencePromoCode(
    codeId: string,
    experienceId: string,
    formData: FormData
) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const code = (formData.get('code') as string | null)?.toUpperCase().trim() ?? ''
    const discount_type = formData.get('discount_type') as DiscountType
    const discount_amount = parseFloat(formData.get('discount_amount') as string)
    const usage_limit_raw = formData.get('usage_limit') as string
    const expires_at_raw = formData.get('expires_at') as string
    const app_only = formData.get('app_only') === 'true'

    if (!(discount_amount > 0)) return { error: 'Discount amount must be positive' }
    if (discount_type === 'percentage' && discount_amount > 100) {
        return { error: 'Percentage cannot exceed 100%' }
    }

    const { data: existing } = await supabase
        .from('promo_codes').select('code, usage_count').eq('id', codeId).single()
    if (!existing) return { error: 'Promo code not found' }

    const usage_limit = usage_limit_raw ? parseInt(usage_limit_raw) : null
    if (usage_limit !== null && usage_limit < existing.usage_count) {
        return {
            error: `Usage limit cannot be below the ${existing.usage_count} already redeemed. `
                 + `Set it to ${existing.usage_count} to stop the code, or switch it off.`,
        }
    }

    const renaming = code && code !== existing.code
    if (renaming && existing.usage_count > 0) {
        return { error: 'This code has been used, so its name is locked. Create a new code instead.' }
    }
    if (renaming && code.length < 3) return { error: 'Code must be at least 3 characters' }

    const { data: updated, error } = await supabase
        .from('promo_codes')
        .update({
            ...(renaming ? { code } : {}),
            discount_type,
            discount_amount,
            usage_limit,
            expires_at: expires_at_raw || null,
            app_only,
        })
        .eq('id', codeId)
        .eq('experience_id', experienceId)
        .select('id')

    if (error) {
        console.error('Error updating experience promo code:', error)
        if (error.code === '23505') {
            return { error: 'This code already exists for this experience' }
        }
        return { error: 'Failed to update promo code' }
    }
    if (!updated || updated.length === 0) {
        return { error: 'Not authorized to edit this promo code' }
    }

    revalidatePath(`/organizer/experiences/${experienceId}/edit`)
    return { success: true }
}

export async function deleteExperiencePromoCode(codeId: string, experienceId: string) {
    const supabase = await createClient()
    const { error } = await supabase.from('promo_codes').delete().eq('id', codeId)

    if (error) {
        console.error('Error deleting experience promo code:', error)
        return { error: 'Failed to delete promo code' }
    }
    revalidatePath(`/organizer/experiences/${experienceId}/edit`)
    return { success: true }
}
