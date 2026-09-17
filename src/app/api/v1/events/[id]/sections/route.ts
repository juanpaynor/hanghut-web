import { authenticateApiKey, isAuthError } from '@/lib/api/api-middleware'
import { apiSuccess, apiError, handleCors } from '@/lib/api/api-helpers'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/events/:id/sections
 * Seated events: the sections a checkout can name, with live availability and
 * the longest run of seats together per price category. Empty for general
 * admission events.
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await authenticateApiKey(request)
    if (isAuthError(auth)) return auth

    const { id } = await params
    const supabase = createAdminClient()

    const { data: event } = await supabase
        .from('events')
        .select('id, organizer_id, seat_selection_mode')
        .eq('id', id)
        .maybeSingle()
    if (!event || event.organizer_id !== auth.partnerId) return apiError('Event not found', 404)

    const [{ data: status }, { data: sections }, { data: tiers }] = await Promise.all([
        supabase.rpc('get_event_seat_status', { p_event_id: id }),
        supabase.from('event_sections').select('id, label, tier_id, sort_order').eq('event_id', id).eq('is_active', true).order('sort_order'),
        supabase.from('ticket_tiers').select('id, name, price').eq('event_id', id),
    ])

    if (!status) return apiSuccess({ seated: false, sections: [] })

    const tierById = new Map((tiers ?? []).map((t: any) => [t.id, t]))
    const byId = new Map<string, any>(((status as any).sections ?? []).map((s: any) => [s.id, s]))

    return apiSuccess({
        seated: true,
        selection_mode: event.seat_selection_mode ?? 'both',
        sections: (sections ?? []).map((sec: any) => {
            const st = byId.get(sec.id)
            return {
                id: sec.id,
                label: sec.label,
                available: Number(st?.available_count ?? 0),
                largest_block: Number(st?.largest_block ?? 0),
                on_sale: st?.on_sale ?? false,
                prices: ((st?.by_tier ?? []) as any[]).map((b) => {
                    const t: any = tierById.get(b.tier_id)
                    return {
                        tier_id: b.tier_id,
                        name: t?.name ?? null,
                        price: t ? Number(t.price) : null,
                        available: Number(b.available_count ?? 0),
                        largest_block: Number(b.largest_block ?? 0),
                    }
                }),
            }
        }),
    })
}

export async function OPTIONS() {
    return handleCors()
}
