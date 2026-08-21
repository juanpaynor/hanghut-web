'use client'

import { PublicEventCard } from '@/components/events/public-event-card'
import type { DiscoveryEvent } from '@/lib/events/discovery'

interface Category {
    key: string
    label: string
    emoji: string | null
}

interface EventRailProps {
    title: string
    events: DiscoveryEvent[]
    categoryMeta: Map<string, Category>
    /** Optional caption under the title — one short line, not a paragraph. */
    subtitle?: string
    /** Renders a "See all" affordance that hands control back to the grid. */
    onSeeAll?: () => void
    seeAllLabel?: string
}

/**
 * A horizontally scrolling row of event cards.
 *
 * Scrolls rather than wraps on purpose: rails are for browsing a curated slice,
 * and a wrapping grid of six would compete with the real grid further down the
 * page. Renders nothing when empty so a quiet week collapses the section instead
 * of leaving a titled void.
 */
export function EventRail({
    title,
    events,
    categoryMeta,
    subtitle,
    onSeeAll,
    seeAllLabel = 'See all',
}: EventRailProps) {
    if (events.length === 0) return null

    return (
        <section className="container mx-auto px-4 pt-10">
            <div className="flex items-baseline gap-3 mb-4">
                <h2 className="font-headline text-xl font-bold tracking-tight">{title}</h2>
                <span className="text-sm text-muted-foreground tabular-nums">
                    {events.length}
                </span>
                {subtitle && (
                    <span className="hidden sm:inline text-sm text-muted-foreground">
                        {subtitle}
                    </span>
                )}
                {onSeeAll && (
                    <button
                        onClick={onSeeAll}
                        className="ml-auto text-sm font-semibold text-primary hover:underline shrink-0"
                    >
                        {seeAllLabel} →
                    </button>
                )}
            </div>

            {/* -mx-4 px-4 lets cards bleed to the viewport edge while keeping the
                first card aligned with the container gutter. */}
            <div className="-mx-4 px-4 overflow-x-auto no-scrollbar">
                <div className="flex gap-5 pb-2">
                    {events.map(event => (
                        <div key={event.id} className="w-[260px] sm:w-[280px] shrink-0">
                            <PublicEventCard
                                event={event}
                                categoryLabel={
                                    event.category ? categoryMeta.get(event.category)?.label : undefined
                                }
                                categoryEmoji={
                                    event.category
                                        ? categoryMeta.get(event.category)?.emoji ?? undefined
                                        : undefined
                                }
                            />
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
