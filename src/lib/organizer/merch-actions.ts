'use server'

import { createClient } from '@/lib/supabase/server'

export type FulfillmentMode = 'claim' | 'ship' | 'both'

export interface MerchVariant {
    id: string
    product_id: string
    name: string
    options: Record<string, string>
    price: number
    sku: string | null
    quantity_total: number | null
    quantity_sold: number
    is_active: boolean
    sort_order: number
}

export interface MerchProduct {
    id: string
    organizer_id: string
    event_id: string | null
    name: string
    description: string | null
    images: string[]
    fulfillment_mode: FulfillmentMode
    is_active: boolean
    sort_order: number
    variants: MerchVariant[]
}

/** Organizer's full catalog (active + inactive) with nested variants. RLS scopes it. */
export async function getMerchProducts(organizerId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { data, error } = await supabase
        .from('merch_products')
        .select('*, variants:merch_variants(*)')
        .eq('organizer_id', organizerId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })

    if (error) {
        console.error('getMerchProducts error:', error)
        return { error: 'Failed to load merch' }
    }
    // Sort variants within each product.
    const products = (data ?? []).map((p: any) => ({
        ...p,
        variants: (p.variants ?? []).sort((a: MerchVariant, b: MerchVariant) => (a.sort_order - b.sort_order) || (a.price - b.price)),
    })) as MerchProduct[]
    return { products }
}

export async function createMerchProduct(input: {
    organizerId: string
    name: string
    description?: string
    eventId?: string | null
    images?: string[]
    fulfillment_mode?: FulfillmentMode
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }
    if (!input.name.trim()) return { error: 'Name is required' }

    const { data, error } = await supabase
        .from('merch_products')
        .insert({
            organizer_id: input.organizerId,
            name: input.name.trim(),
            description: input.description?.trim() || null,
            event_id: input.eventId ?? null,
            images: input.images ?? [],
            fulfillment_mode: input.fulfillment_mode ?? 'claim',
        })
        .select('*')
        .single()

    if (error) { console.error('createMerchProduct error:', error); return { error: 'Failed to create product' } }
    return { product: { ...data, variants: [] } as MerchProduct }
}

export async function updateMerchProduct(id: string, patch: Partial<{
    name: string
    description: string | null
    event_id: string | null
    images: string[]
    fulfillment_mode: FulfillmentMode
    is_active: boolean
    sort_order: number
}>) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { error } = await supabase.from('merch_products').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { console.error('updateMerchProduct error:', error); return { error: 'Failed to update product' } }
    return { success: true }
}

export async function deleteMerchProduct(id: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    // Guard: don't delete a product that already sold (variants with sold > 0).
    const { data: sold } = await supabase.from('merch_variants').select('id').eq('product_id', id).gt('quantity_sold', 0).limit(1)
    if (sold && sold.length) return { error: 'This product has sales — deactivate it instead of deleting.' }

    const { error } = await supabase.from('merch_products').delete().eq('id', id)
    if (error) { console.error('deleteMerchProduct error:', error); return { error: 'Failed to delete product' } }
    return { success: true }
}

export async function createMerchVariant(input: {
    productId: string
    name: string
    price: number
    options?: Record<string, string>
    sku?: string | null
    quantity_total?: number | null
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }
    if (!input.name.trim()) return { error: 'Variant name is required' }
    if (!(input.price >= 0)) return { error: 'Price must be 0 or more' }

    const { data, error } = await supabase
        .from('merch_variants')
        .insert({
            product_id: input.productId,
            name: input.name.trim(),
            price: input.price,
            options: input.options ?? {},
            sku: input.sku ?? null,
            quantity_total: input.quantity_total ?? null,
        })
        .select('*')
        .single()

    if (error) { console.error('createMerchVariant error:', error); return { error: 'Failed to create variant' } }
    return { variant: data as MerchVariant }
}

export async function updateMerchVariant(id: string, patch: Partial<{
    name: string
    price: number
    options: Record<string, string>
    sku: string | null
    quantity_total: number | null
    is_active: boolean
    sort_order: number
}>) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { error } = await supabase.from('merch_variants').update(patch).eq('id', id)
    if (error) { console.error('updateMerchVariant error:', error); return { error: 'Failed to update variant' } }
    return { success: true }
}

export async function deleteMerchVariant(id: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { data: v } = await supabase.from('merch_variants').select('quantity_sold').eq('id', id).single()
    if (v && Number(v.quantity_sold) > 0) return { error: 'This variant has sales — deactivate it instead.' }

    const { error } = await supabase.from('merch_variants').delete().eq('id', id)
    if (error) { console.error('deleteMerchVariant error:', error); return { error: 'Failed to delete variant' } }
    return { success: true }
}

export interface MerchOrderRow {
    id: string
    created_at: string
    quantity: number
    subtotal: number
    total_amount: number
    fulfillment_mode: 'claim' | 'ship'
    payment_method: string | null
    guest_name: string | null
    guest_email: string | null
    items: { name_snapshot: string; quantity: number; unit_price: number }[]
    claim: { id: string; status: string; claimed_at: string | null } | null
}

/** Completed merch orders for the organizer (sales + fulfillment status). RLS-scoped. */
export async function getMerchOrders(organizerId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { data, error } = await supabase
        .from('merch_orders')
        .select('id, created_at, quantity, subtotal, total_amount, fulfillment_mode, payment_method, guest_name, guest_email, items:merch_order_items(name_snapshot, quantity, unit_price), claim:merch_claims(id, status, claimed_at)')
        .eq('organizer_id', organizerId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(200)

    if (error) {
        console.error('getMerchOrders error:', error)
        return { error: 'Failed to load orders' }
    }
    const orders = (data ?? []).map((o: any) => ({
        ...o,
        claim: Array.isArray(o.claim) ? (o.claim[0] ?? null) : o.claim,
    })) as MerchOrderRow[]
    return { orders }
}

/** Mark a ship-type order as shipped (org-guarded RPC). */
export async function markMerchShipped(orderId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }
    const { data, error } = await supabase.rpc('fulfill_merch_ship', { p_order_id: orderId })
    if (error || !(data as any)?.success) {
        console.error('markMerchShipped error:', error || data)
        return { error: (data as any)?.message || 'Failed to update order' }
    }
    return { success: true }
}

/** Upload a product image to the shared event-covers bucket under merch/. Ownership-checked. */
export async function uploadMerchImage(formData: FormData): Promise<{ url?: string; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const file = formData.get('file') as File | null
    const organizerId = formData.get('organizerId') as string | null
    if (!file || !organizerId) return { error: 'Missing file or organizer' }
    if (!file.type.startsWith('image/')) return { error: 'File must be an image' }
    if (file.size > 5 * 1024 * 1024) return { error: 'Image must be under 5MB' }

    // Ownership: caller must own or manage this organizer.
    const { data: partner } = await supabase
        .from('partners').select('id').eq('user_id', user.id).eq('id', organizerId).maybeSingle()
    if (!partner) {
        const { data: teamMember } = await supabase
            .from('partner_team_members').select('role')
            .eq('user_id', user.id).eq('partner_id', organizerId).in('role', ['owner', 'manager']).maybeSingle()
        if (!teamMember) return { error: 'Permission denied' }
    }

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const fileName = `merch/${organizerId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { data, error } = await supabase.storage.from('event-covers').upload(fileName, file, { contentType: file.type, upsert: false })
    if (error) { console.error('uploadMerchImage error:', error); return { error: 'Upload failed' } }

    const { data: pub } = supabase.storage.from('event-covers').getPublicUrl(data.path)
    return { url: pub.publicUrl }
}
