'use client'

import { useEffect, useState } from 'react'
import { EventAnalytics } from '@/components/organizer/event-analytics'
import { getEventAnalyticsBundle, type EventAnalyticsBundle } from '@/lib/organizer/event-analytics-actions'
import { Card } from '@/components/ui/card'

/**
 * Loads the heavy analytics/customers/email data ONLY when the Analytics tab is
 * opened. Radix Tabs unmounts inactive tab content, so this component mounts (and
 * fetches) the first time the tab is selected — keeping it off the initial
 * event-page load, which was the main source of slowness.
 */
export function AnalyticsTabLazy({ eventId }: { eventId: string }) {
    const [data, setData] = useState<EventAnalyticsBundle | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let active = true
        setLoading(true)
        getEventAnalyticsBundle(eventId)
            .then((res) => { if (active) setData(res) })
            .finally(() => { if (active) setLoading(false) })
        return () => { active = false }
    }, [eventId])

    if (loading || !data) {
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Card key={i} className="h-28 animate-pulse bg-muted/50" />
                    ))}
                </div>
                <Card className="h-64 animate-pulse bg-muted/50" />
            </div>
        )
    }

    return (
        <EventAnalytics
            analytics={data.analytics}
            customers={data.customers}
            emailCampaigns={data.emailCampaigns}
        />
    )
}
