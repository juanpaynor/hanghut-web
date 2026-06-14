import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

/**
 * ============================================================================
 * PAYREX WEBHOOK HANDLER
 * ============================================================================
 * Receives PayRex events (HMAC-SHA256 signed via Payrex-Signature header).
 *
 * Events handled:
 *   setup_intent.succeeded   → first payment method saved; provision subscription
 *   payment_intent.succeeded → recurring charge succeeded; renew subscription period
 *
 * Setup:
 *   1. Deploy this function → get the edge function URL
 *   2. Register it in the PayRex dashboard as a webhook endpoint
 *   3. Copy the signing secret → set as PAYREX_WEBHOOK_SECRET function secret
 * ============================================================================
 */

const SUPABASE_URL             = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const PAYREX_WEBHOOK_SECRET    = Deno.env.get("PAYREX_WEBHOOK_SECRET")

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, payrex-signature",
}

// ─── Signature verification ───────────────────────────────────────────────────
// Header format: t=<timestamp>,te=<test_sig>,li=<live_sig>
// Signed content: `${timestamp}.${rawBody}`
// Algorithm: HMAC-SHA256

async function verifyPayrexSignature(
    secret: string,
    header: string,
    rawBody: string,
    livemode: boolean,
): Promise<boolean> {
    const parts: Record<string, string> = {}
    for (const part of header.split(",")) {
        const [k, v] = part.split("=")
        if (k && v) parts[k.trim()] = v.trim()
    }

    const timestamp = parts["t"]
    const signature = livemode ? parts["li"] : parts["te"]
    if (!timestamp || !signature) return false

    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    )

    const signed = `${timestamp}.${rawBody}`
    const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed))
    const expected = Array.from(new Uint8Array(sigBuf))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("")

    return expected === signature
}

// ─── Provisioning helpers ─────────────────────────────────────────────────────

async function provisionSubscription(supabase: ReturnType<typeof createClient>, params: {
    fanId: string
    tierId: string
    partnerId: string
    payrexCustomerId: string
    payrexPaymentMethodId: string
    payrexRef: string
}) {
    const now = new Date()
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString()
    const periodStart = now.toISOString()

    const { data: tier } = await supabase
        .from("subscription_tiers")
        .select("id, name, price_monthly")
        .eq("id", params.tierId)
        .maybeSingle()

    if (!tier) throw new Error(`Tier not found: ${params.tierId}`)

    // Upsert — handles both new subscriptions and reactivations
    const { data: sub, error } = await supabase
        .from("fan_subscriptions")
        .upsert({
            fan_id: params.fanId,
            tier_id: params.tierId,
            partner_id: params.partnerId,
            status: "active",
            current_period_start: periodStart,
            current_period_end: periodEnd,
            payrex_ref: params.payrexRef,
            payrex_customer_id: params.payrexCustomerId,
            payrex_payment_method_id: params.payrexPaymentMethodId,
            cancelled_at: null,
            updated_at: now.toISOString(),
        }, { onConflict: "fan_id,partner_id" })
        .select("id, fan_id, partner_id")
        .single()

    if (error) throw new Error(`Failed to upsert subscription: ${error.message}`)

    // Log payment
    await supabase.from("subscription_payments").insert({
        subscription_id: sub.id,
        fan_id: params.fanId,
        partner_id: params.partnerId,
        amount: tier.price_monthly,
        platform_fee: 0,
        payrex_ref: params.payrexRef,
        status: "paid",
        billing_period_start: periodStart,
        billing_period_end: periodEnd,
    })

    console.log(`Provisioned subscription ${sub.id} for fan ${params.fanId}`)
    return sub
}

async function renewSubscription(supabase: ReturnType<typeof createClient>, params: {
    subscriptionId: string
    payrexRef: string
    amount: number
}) {
    const now = new Date()
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString()
    const periodStart = now.toISOString()

    const { data: sub, error } = await supabase
        .from("fan_subscriptions")
        .update({
            status: "active",
            current_period_start: periodStart,
            current_period_end: periodEnd,
            payrex_ref: params.payrexRef,
            cancelled_at: null,
            updated_at: now.toISOString(),
        })
        .eq("id", params.subscriptionId)
        .select("id, fan_id, partner_id")
        .single()

    if (error) throw new Error(`Failed to renew subscription: ${error.message}`)

    await supabase.from("subscription_payments").insert({
        subscription_id: sub.id,
        fan_id: sub.fan_id,
        partner_id: sub.partner_id,
        amount: params.amount,
        platform_fee: 0,
        payrex_ref: params.payrexRef,
        status: "paid",
        billing_period_start: periodStart,
        billing_period_end: periodEnd,
    })

    console.log(`Renewed subscription ${sub.id}`)
    return sub
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders })
    }

    if (!PAYREX_WEBHOOK_SECRET) {
        console.error("CRITICAL: PAYREX_WEBHOOK_SECRET is not set")
        return new Response("Server not configured", { status: 500 })
    }

    const rawBody = await req.text()

    let event: any
    try {
        event = JSON.parse(rawBody)
    } catch {
        return new Response("Invalid JSON", { status: 400 })
    }

    const signatureHeader = req.headers.get("payrex-signature") ?? ""
    const livemode = event.livemode === true

    const valid = await verifyPayrexSignature(PAYREX_WEBHOOK_SECRET, signatureHeader, rawBody, livemode)
    if (!valid) {
        console.error("PayRex webhook signature verification failed")
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const data = event.data ?? {}
    const metadata = data.metadata ?? {}

    try {
        switch (event.type) {
            case "setup_intent.succeeded": {
                // Triggered after fan saves payment method via Payrex.js.
                // metadata must include: fan_id, tier_id, partner_id
                const { fan_id, tier_id, partner_id } = metadata
                if (!fan_id || !tier_id || !partner_id) {
                    console.error("setup_intent.succeeded missing metadata", metadata)
                    break
                }

                await provisionSubscription(supabase, {
                    fanId: fan_id,
                    tierId: tier_id,
                    partnerId: partner_id,
                    payrexCustomerId: data.customer?.id ?? data.customer_id ?? "",
                    payrexPaymentMethodId: data.payment_method_id ?? "",
                    payrexRef: data.id,
                })
                break
            }

            case "payment_intent.succeeded": {
                // Triggered after an off-session recurring charge succeeds.
                // metadata must include: subscription_id
                const { subscription_id } = metadata
                if (!subscription_id) {
                    console.error("payment_intent.succeeded missing subscription_id in metadata", metadata)
                    break
                }

                await renewSubscription(supabase, {
                    subscriptionId: subscription_id,
                    payrexRef: data.id,
                    amount: data.amount ?? 0,
                })
                break
            }

            default:
                console.log(`Unhandled PayRex event: ${event.type}`)
        }

        return new Response(JSON.stringify({ received: true }), {
            headers: { "Content-Type": "application/json" },
        })
    } catch (err) {
        console.error("PayRex webhook error:", err)
        return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 })
    }
})
