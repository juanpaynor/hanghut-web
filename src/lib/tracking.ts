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

export type Surface = 'discover' | 'storefront' | 'embed' | 'event' | 'landing'

export interface Attribution {
    channel: string
    utm_source: string | null
    utm_medium: string | null
    utm_campaign: string | null
    referrer: string | null
    /**
     * Influencer / referral code from a /r/<code> link (?ref=). Unlike the rest
     * of attribution (first-touch), ref is LAST-TOUCH: an explicit influencer
     * click always (re-)stamps it, because it's a strong, intentional signal and
     * that influencer should get credit for the sale that follows.
     */
    ref?: string | null
    /**
     * Where the visit CAME FROM, independent of which page they landed on.
     *
     * `channel` conflates two axes: it answers "which surface" (landing,
     * storefront, event) when it cannot answer "which source". That is why
     * 1,169 intents a month arrived from Instagram and Facebook and were filed
     * as `direct` or as a surface name. `source` answers only the acquisition
     * question, so it can be grouped on without that ambiguity.
     */
    source?: string | null
    /** How `source` was determined, so a weak signal is never mistaken for a
     *  strong one: 'utm' | 'click_id' | 'referrer' | 'in_app' */
    source_signal?: string | null
}

const ATTR_KEY = 'hh_attribution_v1'

function safeLocal(): Storage | null {
    try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null }
}

function inIframe(): boolean {
    try { return window.self !== window.top } catch { return true }
}

/**
 * Normalise the many spellings of a source into one token. Organizers write
 * `ig`, `IG`, `insta` and `instagram` on their own links -- 814 intents in the
 * last 30 days carried `utm_source=ig` and were still recorded as `direct`.
 */
const SOURCE_ALIASES: Record<string, string> = {
    ig: 'instagram', insta: 'instagram', instagram: 'instagram',
    fb: 'facebook', facebook: 'facebook', meta: 'facebook', messenger: 'facebook',
    tt: 'tiktok', tiktok: 'tiktok',
    x: 'twitter', twitter: 'twitter',
    yt: 'youtube', youtube: 'youtube',
    google: 'google', bing: 'search', duckduckgo: 'search',
    email: 'email', newsletter: 'email',
    viber: 'viber', whatsapp: 'whatsapp', telegram: 'telegram',
}

/** Referrer hostnames, including the link shims Meta bounces clicks through. */
function sourceFromHost(host: string): string | null {
    const h = host.toLowerCase()
    if (/(^|\.)instagram\.com$/.test(h)) return 'instagram'
    if (/(^|\.)facebook\.com$/.test(h) || h === 'fb.me' || h === 'fb.com') return 'facebook'
    if (/(^|\.)messenger\.com$/.test(h)) return 'facebook'
    if (/(^|\.)tiktok\.com$/.test(h)) return 'tiktok'
    if (h === 't.co' || /(^|\.)twitter\.com$/.test(h) || /(^|\.)x\.com$/.test(h)) return 'twitter'
    if (/(^|\.)youtube\.com$/.test(h) || h === 'youtu.be') return 'youtube'
    if (/(^|\.)google\./.test(h)) return 'google'
    if (/(^|\.)(bing|duckduckgo|yahoo)\./.test(h)) return 'search'
    // Link-in-bio services: the visitor came from someone's profile link, which
    // is almost always a social profile even though the hop hides which one.
    if (/(^|\.)(linktr\.ee|lnk\.bio|bio\.link|beacons\.ai|taplink\.cc)$/.test(h)) return 'link_in_bio'
    return null
}

/**
 * Meta's in-app browsers, from the user agent.
 *
 * This is the signal that recovers the "no referrer" bucket -- 642 intents in
 * 30 days. An Instagram bio link opened in-app frequently sends no referrer and
 * no click id, but the webview still identifies itself: Instagram's UA contains
 * "Instagram", Facebook's carries FBAN/FBAV/FB_IAB.
 */
function sourceFromUserAgent(): string | null {
    try {
        const ua = navigator.userAgent || ''
        if (/Instagram/i.test(ua)) return 'instagram'
        if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return 'facebook'
        return null
    } catch {
        return null
    }
}

/**
 * Resolve the acquisition source, strongest signal first.
 *
 * 1. utm_source   -- the organizer said so explicitly
 * 2. click id     -- fbclid/igshid are appended by the platform itself, so they
 *                    survive a stripped referrer and cannot be faked by accident
 * 3. referrer     -- present on desktop and in normal mobile browsers
 * 4. in-app UA    -- last resort, and the only thing that works for an
 *                    Instagram bio link opened inside the app
 */
function deriveSource(p: URLSearchParams, referrer: string | null):
    { source: string | null; signal: string | null } {

    const utm = (p.get('utm_source') || '').toLowerCase().trim()
    if (utm) return { source: SOURCE_ALIASES[utm] ?? utm, signal: 'utm' }

    if (p.get('igshid')) return { source: 'instagram', signal: 'click_id' }
    if (p.get('fbclid')) return { source: 'facebook', signal: 'click_id' }
    if (p.get('ttclid')) return { source: 'tiktok', signal: 'click_id' }
    if (p.get('gclid')) return { source: 'google', signal: 'click_id' }

    if (referrer) {
        try {
            const fromHost = sourceFromHost(new URL(referrer).hostname)
            if (fromHost) return { source: fromHost, signal: 'referrer' }
        } catch { /* unparseable referrer */ }
    }

    const fromUa = sourceFromUserAgent()
    if (fromUa) return { source: fromUa, signal: 'in_app' }

    return { source: null, signal: null }
}

function deriveChannel(
    surface: Surface | undefined,
    p: URLSearchParams,
    source: string | null,
): string {
    const src = (p.get('utm_source') || '').toLowerCase()
    const med = (p.get('utm_medium') || '').toLowerCase()
    if (med === 'email' || /email|newsletter/.test(src)) return 'email'
    if (src === 'share' || med === 'share') return 'share'
    // An iframe is an embed wherever the click came from, so this stays ahead
    // of the source: the publisher's page IS the channel.
    if (inIframe()) return 'embed'
    // A real acquisition source now beats the surface name. Landing on the
    // event page from Instagram is an Instagram visit, not an "event" visit.
    if (source) return source
    if (surface) return surface
    return 'direct'
}

/**
 * Compute attribution from the current URL and persist it as first-touch (first
 * write wins). Returns the attribution to use for this visit.
 */
export function captureAttribution(surface?: Surface): Attribution {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
    const refParam = params.get('ref')
    const ls = safeLocal()

    // First-touch: reuse existing attribution — but ref is LAST-TOUCH, so an
    // explicit ?ref click still (re-)stamps the influencer code on top.
    if (ls) {
        const existing = ls.getItem(ATTR_KEY)
        if (existing) {
            try {
                const attr = JSON.parse(existing) as Attribution
                if (refParam && attr.ref !== refParam) {
                    attr.ref = refParam
                    try { ls.setItem(ATTR_KEY, JSON.stringify(attr)) } catch { /* ignore */ }
                }
                return attr
            } catch { /* recapture below */ }
        }
    }

    const referrer = (() => {
        try {
            const r = document.referrer
            return r && !r.includes(window.location.host) ? r : null
        } catch { return null }
    })()

    const { source, signal } = deriveSource(params, referrer)

    const attr: Attribution = {
        channel: deriveChannel(surface, params, source),
        utm_source: params.get('utm_source'),
        utm_medium: params.get('utm_medium'),
        utm_campaign: params.get('utm_campaign'),
        referrer,
        ref: refParam,
        source,
        source_signal: signal,
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
