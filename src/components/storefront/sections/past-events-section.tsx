import { PublicEventCard } from '@/components/events/public-event-card'
import { History } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PastEventsSectionProps {
    config: {
        variant?: 'grid'
        columns?: 2 | 3
    }
    events: any[]
}

export function PastEventsSection({ config, events }: PastEventsSectionProps) {
    if (events.length === 0) return null

    const columns = config.columns || 2

    return (
        <section className="py-12 md:py-16 opacity-80 hover:opacity-100 transition-opacity">
            <div className="container mx-auto px-4">
                <div className="flex items-center gap-2 mb-8">
                    <h2 className="text-xl md:text-2xl font-bold text-muted-foreground flex items-center gap-2">
                        <History className="h-5 w-5" />
                        Past Events
                    </h2>
                </div>

                <div className={cn(
                    'grid gap-6',
                    columns === 3
                        ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                        : 'grid-cols-1 md:grid-cols-2'
                )}>
                    {events.map((event: any) => (
                        <div key={event.id} className="grayscale hover:grayscale-0 transition-all duration-300">
                            <PublicEventCard event={event} />
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
