import { Card } from '@/components/ui/card'

/**
 * Instant skeleton for the event detail page. Without this the whole route
 * blocked on all server queries before painting, so pressing an event felt
 * frozen. This renders immediately while the server component streams in.
 */
export default function EventDetailLoading() {
    return (
        <div className="p-8 pb-20">
            {/* Title */}
            <div className="mb-6 space-y-2">
                <div className="h-8 w-72 animate-pulse rounded-md bg-muted" />
                <div className="h-4 w-96 animate-pulse rounded bg-muted/60" />
            </div>

            {/* Tab bar */}
            <div className="mb-6 flex flex-wrap gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-9 w-28 animate-pulse rounded-md bg-muted" />
                ))}
            </div>

            {/* Stat cards */}
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i} className="h-28 animate-pulse bg-muted/50" />
                ))}
            </div>

            {/* Content block */}
            <Card className="h-96 animate-pulse bg-muted/50" />
        </div>
    )
}
