'use client'

/**
 * Acquisition attribution (first-touch), layered onto the EXISTING funnel tracker
 * (src/lib/analytics/track-event.ts → /api/track → event_interactions). This file
 * does NOT record funnel events itself — it only derives + persists the channel /
 * UTM / referrer so trackEventInteraction() and checkout can attach them.
 *
 * First-touch wins: the channel from the visit that first landed the visitor is
 * persisted and reused through checkout, so the sale is credited to what brought
 * them in. Respects nothing here (consent is enforced by the callers that send).
 */

export type Surface = 'discover' | 'storefront' | 'embed' | 'event'

export interface Attribution {
    channel: string
    utm_source: string | null
    utm_medium: string | null
    utm_campaign: string | null
    referrer: string | null
}

const ATTR_KEY = 'hh_attribution_v1'

function safeLocal(): Storage | null {
    try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null }
}

function inIframe(): boolean {
    try { return window.self !== window.top } catch { return true }
}

function deriveChannel(surface: Surface | undefined, p: URLSearchParams): string {
    const src = (p.get('utm_source') || '').toLowerCase()
    const med = (p.get('utm_medium') || '').toLowerCase()
    if (med === 'email' || /email|newsletter/.test(src)) return 'email'
    if (src === 'share' || med === 'share') return 'share'
    if (inIframe()) return 'embed'
    if (surface) return surface
    return 'direct'
}

/**
 * Compute attribution from the current URL and persist it as first-touch (first
 * write wins). Returns the attribution to use for this visit.
 */
export function captureAttribution(surface?: Surface): Attribution {
    const ls = safeLocal()
    if (ls) {
        const existing = ls.getItem(ATTR_KEY)
        if (existing) {
            try { return JSON.parse(existing) as Attribution } catch { /* recapture below */ }
        }
    }

    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
    const ref = (() => {
        try {
            const r = document.referrer
            return r && !r.includes(window.location.host) ? r : null
        } catch { return null }
    })()

    const attr: Attribution = {
        channel: deriveChannel(surface, params),
        utm_source: params.get('utm_source'),
        utm_medium: params.get('utm_medium'),
        utm_campaign: params.get('utm_campaign'),
        referrer: ref,
    }

    if (ls) { try { ls.setItem(ATTR_KEY, JSON.stringify(attr)) } catch { /* ignore */ } }
    return attr
}

/** The persisted first-touch attribution (for checkout / purchase intent). */
export function getStoredAttribution(): Attribution | null {
    const ls = safeLocal()
    if (!ls) return null
    const raw = ls.getItem(ATTR_KEY)
    if (!raw) return null
    try { return JSON.parse(raw) as Attribution } catch { return null }
}
