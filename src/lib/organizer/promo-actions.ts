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
    /**
     * Tiers this code applies to. NULL, a non-array, or an empty array all mean
     * EVERY tier — the same semantics as registration_questions.tier_ids, and
     * why every code that predates the column needs no backfill.
     */
    tier_ids: string[] | null
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

const PROMO_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Tier scope off the form. The tier checkboxes all share the name `tier_ids`,
 * so getAll() returns every ticked one.
 *
 * Two deliberate choices:
 *
 * 1. An empty selection is stored as NULL, never []. Both mean "all tiers" to
 *    every reader, but NULL is what every code predating this column carries,
 *    so "applies to everything" has ONE representation in the table instead of
 *    two that must be kept in sync.
 *
 * 2. Non-uuid values are dropped. The CHECK constraint only enforces that the
 *    column is an array, so junk would store happily and then silently never
 *    match a tier -- a code that looks scoped and discounts nothing.
 *
 * Event codes only. Experiences have no tiers, so the experience variants below
 * deliberately never call this.
 */
function parseTierIds(formData: FormData): string[] | null {
    const ids = formData
        .getAll('tier_ids')
        .map((v) => String(v).trim())
        .filter((v) => PROMO_UUID_RE.test(v))
    return ids.length > 0 ? Array.from(new Set(ids)) : null
}

export async function createPromoCode(eventId: string, formData: FormData) {
    const supabase = await createClient()

    const code = formData.get('code') as string
    const discount_type = formData.get('discount_type') as DiscountType
    const discount_amount = parseFloat(formData.get('discount_amount') as string)
    const usage_limit_raw = formData.get('usage_limit') as string
    const expires_at_raw = formData.get('expires_at') as string
    const app_only = formData.get('app_only') === 'true'
    const tier_ids = parseTierIds(formData)

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
            tier_ids,
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
            tier_ids: parseTierIds(formData),
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

/**
 * Buyer-facing preview of a code, before they pay.
 *
 * This MIRRORS the gate in create-purchase-intent and is not the gate itself --
 * it runs with the caller's own client and anything it decides can be skipped by
 * posting straight to the edge function. Every refusal here must exist there
 * too; the point of this function is to tell someone the code is wrong while
 * they can still do something about it.
 *
 * `tierId` is optional so existing callers keep compiling, but checkout always
 * knows its tier and must pass it: without it a tier-scoped code cannot be
 * judged, and we deliberately let it through here rather than guess, because
 * the server has the final say and the real tier.
 */
export async function validatePromoCode(eventId: string, code: string, subtotal: number, tierId?: string | null) {
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

    // 1c. Not started yet. starts_at had never been checked on either side —
    // a code scheduled for next month discounted from the moment it was saved.
    if (promo.starts_at && new Date(promo.starts_at) > new Date()) {
        return { error: 'This promo code is not active yet' }
    }

    // 3. Check Usage Limit
    if (promo.usage_limit && promo.usage_count >= promo.usage_limit) {
        return { error: 'Promo code usage limit reached' }
    }

    // 3b. Tier scope. NULL / non-array / empty array all mean every tier, so
    // every code that predates this column behaves exactly as before.
    //
    // A scoped code with NO tierId passed falls through to success here. That
    // is deliberate: the server re-checks against the tier it actually charges
    // for, so guessing would only produce a wrong answer earlier. Checkout
    // passes the tier, so in practice the buyer still finds out before paying.
    const tierScope: unknown = (promo as { tier_ids?: unknown }).tier_ids
    if (Array.isArray(tierScope) && tierScope.length > 0 && tierId) {
        if (!tierScope.map(String).includes(String(tierId))) {
            // Name the tiers it works on — the buyer cannot guess, and the fix
            // is for them to pick a different ticket.
            const { data: scopeTiers } = await supabase
                .from('ticket_tiers')
                .select('name')
                .in('id', tierScope.map(String))
            const names = (scopeTiers ?? []).map((t) => t.name).filter(Boolean)
            return {
                error: names.length
                    ? `This code only applies to: ${names.join(', ')}`
                    : 'This code does not apply to the ticket you selected',
                wrongTier: true,
            }
        }
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
 * Until 20261007130000_experience_promo_codes_fix this whole path was dead:
 * both "manage" policies filtered on `event_id IN (...)`, and for an experience
 * code event_id is NULL, so the predicate was NULL and never true -- no
 * experience promo code could be inserted or edited, which is why prod held
 * zero of them. That migration adds a policy keyed on experience_id (host,
 * partner owner, or partner team member, matching
 * experience-question-actions.ts) and the partial unique index that makes the
 * 23505 branch below reachable.
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
