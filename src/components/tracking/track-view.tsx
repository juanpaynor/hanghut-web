'use client'

import { useEffect } from 'react'
import { captureAttribution, type Surface } from '@/lib/tracking'

/**
 * Persists first-touch attribution for a landing surface (e.g. the storefront)
 * that isn't tied to a single event. When the visitor then opens an event, the
 * existing funnel tracker (trackEventInteraction) reuses this stored attribution.
 *
 * Note: event 'view' events are already recorded by <EventViewTracker> via
 * trackEventInteraction — this component only captures attribution, it does not
 * record a funnel event.
 */
export function CaptureAttribution({ surface }: { surface: Surface }) {
    useEffect(() => {
        captureAttribution(surface)
    }, [surface])
    return null
}
