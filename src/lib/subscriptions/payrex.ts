const BASE_URL = "https://api.payrexhq.com"

function authHeader() {
    const key = process.env.PAYREX_SECRET
    if (!key) throw new Error("PAYREX_SECRET is not set")
    return "Basic " + Buffer.from(`${key}:`).toString("base64")
}

async function payrexRequest(method: string, path: string, body?: object) {
    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
            Authorization: authHeader(),
            "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    })

    const json = await res.json()
    if (!res.ok) {
        const detail = json?.errors?.[0]?.detail ?? res.statusText
        throw new Error(`PayRex ${method} ${path} failed: ${detail}`)
    }
    return json
}

// ─── Customer ─────────────────────────────────────────────────────────────────

export async function createPayrexCustomer(params: {
    name: string
    email: string
    userId: string
}): Promise<{ id: string }> {
    return payrexRequest("POST", "/customers", {
        currency: "PHP",
        name: params.name,
        email: params.email,
        metadata: { internal_customer_id: params.userId },
    })
}

// ─── Setup Intent (save payment method) ──────────────────────────────────────

export async function createSetupIntent(params: {
    customerId: string
    fanId: string
    tierId: string
    partnerId: string
}): Promise<{ id: string; client_secret: string }> {
    return payrexRequest("POST", "/setup_intents", {
        customer_id: params.customerId,
        payment_methods: ["card", "gcash", "maya"],
        usage: "off_session",
        metadata: {
            fan_id: params.fanId,
            tier_id: params.tierId,
            partner_id: params.partnerId,
        },
    })
}

// ─── Payment Intent (off-session recurring charge) ────────────────────────────

export async function createOffSessionCharge(params: {
    customerId: string
    paymentMethodId: string
    amount: number
    description: string
    subscriptionId: string
}): Promise<{ id: string; status: string }> {
    return payrexRequest("POST", "/payment_intents", {
        amount: Math.round(params.amount * 100), // centavos
        currency: "PHP",
        customer_id: params.customerId,
        payment_method_id: params.paymentMethodId,
        description: params.description,
        metadata: { subscription_id: params.subscriptionId },
    })
}
