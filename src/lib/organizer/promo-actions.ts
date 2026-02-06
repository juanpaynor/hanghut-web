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
            is_active: true
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

export async function deletePromoCode(codeId: string, eventId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('promo_codes')
        .delete()
        .eq('id', codeId)

    if (error) {
        console.error('Error deleting promo code:', error)
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

    // 2. Check Expiry
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
