import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

/**
 * ============================================================================
 * CREATE SUBSCRIPTION CHECKOUT
 * ============================================================================
 * Called by the Next.js app when a fan clicks "Subscribe". Validates the tier,
 * creates a PayRex Customer (or reuses one), creates a SetupIntent, and returns
 * the client_secret + public_key so the frontend can complete payment via
 * Payrex.js — no PayRex keys needed in Vercel at all.
 *
 * Auth: Supabase JWT (verify_jwt: true). Pass the user's access token as
 *       Authorization: Bearer <token>
 * Body: { tier_id: string }
 * ============================================================================
 */

const SUPABASE_URL             = Deno.env.get("SUPABASE_URL")!
const SUPABASE_ANON_KEY        = Deno.env.get("SUPABASE_ANON_KEY")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const PAYREX_SECRET            = Deno.env.get("PAYREX_SECRET")!
const PAYREX_API               = Deno.env.get("PAYREX_API")! // publishable key

const PAYREX_BASE = "https://api.payrexhq.com"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
}

// ─── PayRex helpers ───────────────────────────────────────────────────────────

function payrexAuth() {
    return "Basic " + btoa(`${PAYREX_SECRET}:`)
}

async function payrexPost(path: string, body: object) {
    const res = await fetch(`${PAYREX_BASE}${path}`, {
        method: "POST",
        headers: {
            Authorization: payrexAuth(),
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) {
        const detail = data?.errors?.[0]?.detail ?? res.statusText
        throw new Error(`PayRex ${path}: ${detail}`)
    }
    return data
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

    // JWT is pre-verified by Supabase (verify_jwt: true).
    // Create a user-scoped client to identify the caller.
    const authHeader = req.headers.get("Authorization") ?? ""
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
    })
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return json({ error: "Unauthorized" }, 401)

    let body: { tier_id?: string }
    try { body = await req.json() } catch { return json({ error: "Invalid JSON" }, 400) }

    const { tier_id } = body
    if (!tier_id) return json({ error: "tier_id is required" }, 400)

    // ── Validate tier + partner ───────────────────────────────────────────────
    const { data: tier } = await adminClient
        .from("subscription_tiers")
        .select("id, name, price_monthly, is_active, partner_id, partners(business_name, kyc_status, verified)")
        .eq("id", tier_id)
        .maybeSingle()

    if (!tier) return json({ error: "Tier not found" }, 404)
    if (!tier.is_active) return json({ error: "This tier is no longer available" }, 400)

    const partner = tier.partners as any
    if (!partner?.verified || partner?.kyc_status !== "verified") {
        return json({ error: "This organizer is not yet verified" }, 400)
    }

    // ── Block duplicate active subscription ───────────────────────────────────
    const { data: existing } = await adminClient
        .from("fan_subscriptions")
        .select("id, status, payrex_customer_id")
        .eq("fan_id", user.id)
        .eq("partner_id", tier.partner_id)
        .maybeSingle()

    if (existing && (existing.status === "active" || existing.status === "grace_period")) {
        return json({ error: "You already have an active subscription to this organizer" }, 409)
    }

    // ── Get or create PayRex customer ─────────────────────────────────────────
    let payrexCustomerId: string = existing?.payrex_customer_id ?? ""

    if (!payrexCustomerId) {
        const { data: profile } = await adminClient
            .from("users")
            .select("full_name, email")
            .eq("id", user.id)
            .maybeSingle()

        const customer = await payrexPost("/customers", {
            currency: "PHP",
            name: profile?.full_name || user.email || "HangHut Fan",
            email: user.email || profile?.email || "",
            metadata: { internal_customer_id: user.id },
        })
        payrexCustomerId = customer.id
    }

    // ── Create setup intent ───────────────────────────────────────────────────
    const setupIntent = await payrexPost("/setup_intents", {
        customer_id: payrexCustomerId,
        payment_methods: ["card", "gcash", "maya"],
        usage: "off_session",
        metadata: {
            fan_id: user.id,
            tier_id: tier.id,
            partner_id: tier.partner_id,
        },
    })

    return json({
        client_secret: setupIntent.client_secret,
        public_key: PAYREX_API,
    })
})
