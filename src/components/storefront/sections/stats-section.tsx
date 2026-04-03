import { cn } from '@/lib/utils'

interface StatsSectionProps {
    config: {
        items?: Array<{ label: string; value: string }>
    }
}

export function StatsSection({ config }: StatsSectionProps) {
    const items = config.items || []
    if (items.length === 0) return null

    return (
        <section className="py-16 md:py-20">
            <div className="container mx-auto px-4">
                <div className={cn(
                    'grid gap-6 text-center',
                    items.length <= 2 ? 'grid-cols-2 max-w-xl mx-auto' :
                        items.length === 3 ? 'grid-cols-3 max-w-3xl mx-auto' :
                            'grid-cols-2 md:grid-cols-4 max-w-4xl mx-auto'
                )}>
                    {items.map((item, i) => (
                        <div
                            key={i}
                            className="p-6 rounded-2xl bg-card border border-border/50 shadow-sm hover:shadow-md transition-shadow"
                        >
                            <div className="text-3xl md:text-4xl font-bold text-primary mb-2 tracking-tight">
                                {item.value}
                            </div>
                            <div className="text-sm text-muted-foreground font-medium uppercase tracking-wider">
                                {item.label}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
