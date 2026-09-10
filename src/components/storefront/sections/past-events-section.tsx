import { PublicEventCard } from '@/components/events/public-event-card'
import { cn } from '@/lib/utils'
import { SectionShell, SectionHeading } from './section-shell'

interface PastEventsSectionProps {
    config: {
        variant?: 'grid'
        columns?: 2 | 3
    }
    events: any[]
}

/**
 * An archive, not an offer. It should read as clearly secondary to the upcoming
 * events above without being hidden.
 *
 * The old version leaned on two hover tricks to say "past": the whole section at
 * 80% opacity, and every card greyscaled until moused over. Both fail where it
 * matters — on touch there is no hover, so the section just looked faded and the
 * photography looked broken. The hierarchy is now structural: a smaller heading,
 * a hairline above it, and a tighter grid. The images stay in colour.
 */
export function PastEventsSection({ config, events }: PastEventsSectionProps) {
    if (events.length === 0) return null

    const columns = config.columns || 2

    return (
        <SectionShell rhythm="tight" width="wide">
            <div className="border-t border-border/70 pt-12">
                <SectionHeading
                    eyebrow="Archive"
                    title="Past events"
                    action={
                        <span className="text-sm text-muted-foreground tabular-nums">
                            {events.length} {events.length === 1 ? 'event' : 'events'}
                        </span>
                    }
                    className="mb-8 md:mb-10"
                />

                <div
                    className={cn(
                        'grid gap-x-6 gap-y-10',
                        columns === 3
                            ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                            : 'grid-cols-1 md:grid-cols-2',
                    )}
                >
                    {events.map((event: any) => (
                        <PublicEventCard key={event.id} event={event} />
                    ))}
                </div>
            </div>
        </SectionShell>
    )
}
