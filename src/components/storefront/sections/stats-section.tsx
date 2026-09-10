import { cn } from '@/lib/utils'
import { SectionShell } from './section-shell'

interface StatsSectionProps {
    config: {
        items?: Array<{ label: string; value: string }>
    }
}

/**
 * Three or four numbers. Previously each sat in its own bordered, shadowed card,
 * which is a lot of chrome for a figure and a word — the boxes read louder than
 * the numbers in them. Now the numerals carry it, separated by hairlines, with
 * tabular figures so the row stays aligned whatever the values.
 */
export function StatsSection({ config }: StatsSectionProps) {
    const items = config.items || []
    if (items.length === 0) return null

    return (
        <SectionShell rhythm="tight" width="default">
            <dl
                className={cn(
                    'grid divide-y divide-border/70 sm:divide-y-0 sm:divide-x',
                    items.length <= 2
                        ? 'grid-cols-1 sm:grid-cols-2 max-w-2xl mx-auto'
                        : items.length === 3
                            ? 'grid-cols-1 sm:grid-cols-3 max-w-4xl mx-auto'
                            : 'grid-cols-2 sm:grid-cols-4 max-w-5xl mx-auto',
                )}
            >
                {items.map((item, i) => (
                    // flex-col so `order` can put the numeral above its label while
                    // the markup keeps the semantic dt-then-dd pairing.
                    <div key={i} className="flex flex-col px-6 py-6 text-center first:pt-0 sm:first:pt-6">
                        <dt className="order-2 mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {item.label}
                        </dt>
                        <dd className="order-1 text-[2.5rem] md:text-[3rem] font-semibold leading-none tracking-[-0.03em] tabular-nums">
                            {item.value}
                        </dd>
                    </div>
                ))}
            </dl>
        </SectionShell>
    )
}
