import { createPublicClient } from '@/lib/supabase/public'

export interface PublicMerchVariant {
    id: string
    name: string
    options: Record<string, string>
    price: number
    quantity_total: number | null
    quantity_sold: number
}

export interface PublicMerchProduct {
    id: string
    name: string
    description: string | null
    images: string[]
    fulfillment_mode: 'claim' | 'ship' | 'both'
    variants: PublicMerchVariant[]
}

/**
 * Buyer-facing merch for an event page / storefront: an organizer's active
 * products that are sellable standalone (available_as in standalone|both),
 * scoped to this event plus the organizer's storefront-wide items. Public read.
 */
export async function getPublicMerch(organizerId: string, eventId?: string): Promise<PublicMerchProduct[]> {
    const supabase = createPublicClient()

    // Feature-gated per partner: no merch shown unless an admin enabled this organizer.
    const { data: partner } = await supabase
        .from('partners').select('merch_enabled').eq('id', organizerId).maybeSingle()
    if (!partner?.merch_enabled) return []

    let query = supabase
        .from('merch_products')
        .select('id, name, description, images, fulfillment_mode, event_id, variants:merch_variants(id, name, options, price, quantity_total, quantity_sold, is_active, sort_order)')
        .eq('organizer_id', organizerId)
        .eq('is_active', true)
        .in('available_as', ['standalone', 'both'])
        .order('sort_order', { ascending: true })

    // Event page shows this event's merch + the organizer's storefront-wide merch.
    if (eventId) query = query.or(`event_id.eq.${eventId},event_id.is.null`)

    const { data, error } = await query
    if (error || !data) return []

    return data
        .map((p: any) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            images: p.images ?? [],
            fulfillment_mode: p.fulfillment_mode,
            variants: (p.variants ?? [])
                .filter((v: any) => v.is_active !== false)
                .sort((a: any, b: any) => (a.sort_order - b.sort_order) || (a.price - b.price))
                .map((v: any) => ({
                    id: v.id, name: v.name, options: v.options ?? {},
                    price: Number(v.price), quantity_total: v.quantity_total, quantity_sold: Number(v.quantity_sold ?? 0),
                })),
        }))
        .filter((p: PublicMerchProduct) => p.variants.length > 0)
}
