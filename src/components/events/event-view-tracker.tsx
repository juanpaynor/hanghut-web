'use client'

import { useEffect } from 'react'
import { trackEventInteraction } from '@/lib/analytics/track-event'

/**
 * Logs a single page view for the event — once per browser session per event,
 * so refreshes / re-renders don't inflate the count. Renders nothing.
 */
export function EventViewTracker({ eventId }: { eventId: string }) {
    useEffect(() => {
        if (!eventId || typeof window === 'undefined') return
        const key = `hh_viewed_${eventId}`
        try {
            if (sessionStorage.getItem(key)) return
            sessionStorage.setItem(key, '1')
        } catch {
            /* private mode — still track, just may dupe */
        }
        trackEventInteraction(eventId, 'view')
    }, [eventId])

    return null
}
