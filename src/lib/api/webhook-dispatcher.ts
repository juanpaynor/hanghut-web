import { createAdminClient } from '@/lib/supabase/admin'
import { createHmac } from 'crypto'

/**
 * Dispatch a webhook event to all registered endpoints for a given partner
 */
export async function dispatchWebhook(
    partnerId: string,
    eventType: string,
    payload: Record<string, any>
) {
    const supabase = createAdminClient()

    // Get all active webhook endpoints for this partner that subscribe to this event
    const { data: endpoints } = await supabase
        .from('webhook_endpoints')
        .select('id, url, secret, events')
        .eq('partner_id', partnerId)
        .eq('is_active', true)

    if (!endpoints || endpoints.length === 0) return

    const matchingEndpoints = endpoints.filter(
        (ep: any) => ep.events.includes(eventType)
    )

    for (const endpoint of matchingEndpoints) {
        const ep = endpoint as any
        const body = JSON.stringify({
            id: crypto.randomUUID(),
            type: eventType,
            created_at: new Date().toISOString(),
            data: payload,
        })

        // HMAC-SHA256 signature for verification
        const signature = createHmac('sha256', ep.secret)
            .update(body)
            .digest('hex')

        try {
            const response = await fetch(ep.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-HangHut-Signature': signature,
                    'X-HangHut-Event': eventType,
                },
                body,
                signal: AbortSignal.timeout(10000), // 10s timeout
            })

            // Log delivery attempt
            await supabase.from('webhook_deliveries').insert({
                webhook_endpoint_id: ep.id,
                event_type: eventType,
                payload: JSON.parse(body),
                response_status: response.status,
                response_body: await response.text().catch(() => ''),
                success: response.ok,
            })
        } catch (err: any) {
            // Log failed delivery
            await supabase.from('webhook_deliveries').insert({
                webhook_endpoint_id: ep.id,
                event_type: eventType,
                payload: JSON.parse(body),
                response_status: 0,
                response_body: err.message || 'Connection failed',
                success: false,
            })
        }
    }
}
