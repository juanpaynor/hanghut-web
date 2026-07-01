import { Card } from '@/components/ui/card'

/**
 * Instant skeleton shown while the (force-dynamic) My Events page server-renders.
 * Without this, navigation/refresh shows a blank screen until all data resolves.
 */
export default function Loading() {
    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <div className="h-9 w-48 bg-muted rounded animate-pulse" />
                    <div className="h-4 w-56 bg-muted rounded animate-pulse" />
                </div>
                <div className="h-11 w-40 bg-muted rounded-md animate-pulse" />
            </div>

            <div className="h-12 w-full bg-muted/60 rounded-lg animate-pulse" />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i} className="overflow-hidden">
                        <div className="h-48 bg-muted animate-pulse" />
                        <div className="p-6 space-y-4">
                            <div className="space-y-2">
                                <div className="h-5 w-3/4 bg-muted rounded animate-pulse" />
                                <div className="h-4 w-1/2 bg-muted rounded animate-pulse" />
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                                <div className="space-y-2">
                                    <div className="h-3 w-16 bg-muted rounded animate-pulse" />
                                    <div className="h-6 w-20 bg-muted rounded animate-pulse" />
                                </div>
                                <div className="space-y-2">
                                    <div className="h-3 w-12 bg-muted rounded animate-pulse" />
                                    <div className="h-6 w-16 bg-muted rounded animate-pulse" />
                                </div>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    )
}
