'use client'

import { analyticsAllowed } from '@/lib/consent'
import { captureAttribution } from '@/lib/tracking'

export type InteractionType =
    | 'view'
    | 'get_tickets'
    | 'pick_seats'
    | 'share'
    | 'add_to_calendar'
    | 'checkout_started'

const SESSION_KEY = 'hh_session_id'

/** Stable, anonymous per-browser id (no PII) used to de-dupe unique views. */
function getSessionId(): string {
    if (typeof window === 'undefined') return ''
    try {
        let id = localStorage.getItem(SESSION_KEY)
        if (!id) {
            id = (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)
            localStorage.setItem(SESSION_KEY, id)
        }
        return id
    } catch {
        return ''
    }
}

/**
 * Fire-and-forget interaction logging for an event page. Never throws and never
 * blocks the UI — analytics must not interfere with the actual action.
 */
export function trackEventInteraction(eventId: string, type: InteractionType) {
    if (typeof window === 'undefined' || !eventId) return
    // Respect the visitor's analytics cookie choice (opt-out honored).
    if (!analyticsAllowed()) return
    try {
        // First-touch acquisition attribution (channel / utm / referrer). Captured
        // once and reused across the funnel so every step is credited consistently.
        const attr = captureAttribution()
        fetch('/api/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event_id: eventId,
                type,
                session_id: getSessionId(),
                channel: attr.channel,
                utm_source: attr.utm_source,
                utm_medium: attr.utm_medium,
                utm_campaign: attr.utm_campaign,
                referrer: attr.referrer,
            }),
            keepalive: true,
        }).catch(() => {})
    } catch {
        /* swallow — tracking is best-effort */
    }
}
