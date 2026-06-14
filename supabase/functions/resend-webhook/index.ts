import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

/**
 * ============================================================================
 * RESEND WEBHOOK HANDLER — Phase 2 (engagement tracking + auto-suppression)
 * ============================================================================
 * Receives Resend email.* events (Svix-signed), records them into email_events,
 * updates the per-recipient email_sends ledger, and auto-suppresses dead
 * addresses (hard bounce → global) and spam complaints (→ per-partner).
 *
 * Setup: create a webhook in the Resend dashboard pointing here, copy its
 * signing secret into the RESEND_WEBHOOK_SECRET function secret.
 * ============================================================================
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
const RESEND_WEBHOOK_SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET") // "whsec_..."

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type, svix-id, svix-timestamp, svix-signature',
}

function b64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
}

function bytesToB64(bytes: Uint8Array): string {
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    return btoa(bin)
}

/**
 * Verify a Svix-signed webhook (the scheme Resend uses).
 * Signed content is `${id}.${timestamp}.${body}`; the secret is the base64
 * payload after the `whsec_` prefix. The signature header carries one or more
 * space-separated `v1,<b64sig>` entries.
 */
async function verifySvix(
    secret: string, svixId: string, svixTimestamp: string, svixSignature: string, body: string
): Promise<boolean> {
    if (!secret || !svixId || !svixTimestamp || !svixSignature) return false
    const secretBytes = b64ToBytes(secret.replace(/^whsec_/, ''))
    const key = await crypto.subtle.importKey(
        'raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    )
    const signed = `${svixId}.${svixTimestamp}.${body}`
    const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signed))
    const expected = bytesToB64(new Uint8Array(sigBuf))
    // Header is space-separated "v1,<sig>" pairs — pass if any matches.
    return svixSignature.split(' ').some(part => {
        const idx = part.indexOf(',')
        const sig = idx === -1 ? part : part.slice(idx + 1)
        return sig === expected
    })
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    if (!RESEND_WEBHOOK_SECRET) {
        console.error('CRITICAL: RESEND_WEBHOOK_SECRET is not set')
        return new Response('Server not configured', { status: 500, headers: corsHeaders })
    }

    // Read the raw body for signature verification (must be the exact bytes).
    const rawBody = await req.text()

    const verified = await verifySvix(
        RESEND_WEBHOOK_SECRET,
        req.headers.get('svix-id') ?? '',
        req.headers.get('svix-timestamp') ?? '',
        req.headers.get('svix-signature') ?? '',
        rawBody,
    )
    if (!verified) {
        console.error('🚫 Resend webhook signature verification failed')
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

    try {
        const event = JSON.parse(rawBody)
        const fullType: string = event.type || ''           // e.g. "email.delivered"
        const type = fullType.replace(/^email\./, '')        // -> "delivered"
        const data = event.data || {}
        const emailId: string | null = data.email_id || null
        const recipient: string | null = Array.isArray(data.to) ? data.to[0] : (data.to || null)
        const occurredAt = event.created_at || new Date().toISOString()

        // Map this Resend message back to the marketing send (if any).
        let campaignId: string | null = null
        let partnerId: string | null = null
        let sendId: string | null = null
        let sendRecipient: string | null = null
        if (emailId) {
            const { data: send } = await supabase
                .from('email_sends')
                .select('id, campaign_id, partner_id, recipient')
                .eq('resend_id', emailId)
                .maybeSingle()
            if (send) {
                campaignId = send.campaign_id
                partnerId = send.partner_id
                sendId = send.id
                sendRecipient = send.recipient
            }
        }

        const recip = recipient || sendRecipient
        const isSuppressable = type === 'bounced' || type === 'complained'

        // Log the event for marketing sends, plus any suppressable event (so we
        // keep a record of why an address was suppressed). Transactional opens/
        // clicks with no marketing send row are skipped to avoid noise.
        if ((sendId || isSuppressable) && recip) {
            const { error: evErr } = await supabase
                .from('email_events')
                .insert({
                    resend_id: emailId,
                    campaign_id: campaignId,
                    recipient: recip,
                    type: type,
                    occurred_at: occurredAt,
                    metadata: data,
                })
            // Unique (resend_id, type, recipient) dedupes webhook redeliveries.
            if (evErr && evErr.code !== '23505') {
                console.error('⚠️ Failed to insert email_event:', evErr)
            }
        }

        // Reflect terminal states onto the send ledger.
        if (sendId && ['delivered', 'bounced', 'complained'].includes(type)) {
            await supabase.from('email_sends').update({ status: type }).eq('id', sendId)
        }

        // Auto-suppression — the reputation safety net.
        //  - hard bounce  → GLOBAL (dead address, nobody should mail it)
        //  - complaint    → per-partner (they don't want THIS sender's mail)
        if (recip && type === 'bounced') {
            await supabase.from('email_suppressions').upsert(
                { partner_id: null, email: recip.toLowerCase(), reason: 'bounce', source: 'webhook' },
                { onConflict: 'partner_id,email', ignoreDuplicates: true }
            )
            console.log(`🚫 Global-suppressed bounced address: ${recip}`)
        } else if (recip && type === 'complained') {
            await supabase.from('email_suppressions').upsert(
                { partner_id: partnerId, email: recip.toLowerCase(), reason: 'complaint', source: 'webhook' },
                { onConflict: 'partner_id,email', ignoreDuplicates: true }
            )
            console.log(`🚫 Suppressed complaint (partner ${partnerId ?? 'global'}): ${recip}`)
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    } catch (error) {
        console.error('💥 Resend webhook error:', error)
        return new Response(JSON.stringify({ error: (error as Error).message }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
