'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Check, Sparkles } from 'lucide-react'

/**
 * How the big option sets (backgrounds, layouts) are presented.
 *
 * Nothing is removed — prod says six of twelve layouts and three of seven
 * themes have never been chosen by anyone, but a look an organizer published
 * with must stay pickable forever, and a look nobody has tried yet is not the
 * same thing as a bad one. So the fix is ORDER, not deletion:
 *
 *   popular  — what organizers actually ship, shown first and labelled
 *   more     — everything else that is current, shown plainly
 *   older    — superseded looks, folded away until asked for (or in use)
 *
 * The old grid was one flat wall of eleven equal-weight tiles, which is the
 * thing people meant by "too complex": not too many options, no opinion about
 * which one to take. A tier plus one "Most picked" chip is the whole fix.
 */

export type DesignOption = {
    value: string
    label: string
    desc: string
    /** Shipped by real organizers — shown first under "Most picked". */
    popular?: boolean
    /** Superseded. Hidden unless selected or explicitly revealed. */
    legacy?: boolean
    /** Marks a look added recently, so repeat organizers notice it. */
    isNew?: boolean
}

export function DesignOptionGrid({
    options,
    value,
    onChange,
    renderPreview,
    legacyLabel = 'Show older looks',
    columns = 'grid-cols-2 sm:grid-cols-3',
}: {
    options: DesignOption[]
    value: string
    onChange: (next: string) => void
    renderPreview: (value: string) => ReactNode
    legacyLabel?: string
    columns?: string
}) {
    const [showLegacy, setShowLegacy] = useState(false)

    // An option in use is never hidden, whatever tier it sits in — otherwise a
    // live event's own look vanishes from the picker that is meant to show it.
    const visible = options.filter(o => !o.legacy || o.value === value || showLegacy)
    const popular = visible.filter(o => o.popular && !o.legacy)
    const more = visible.filter(o => !o.popular && !o.legacy)
    const older = visible.filter(o => o.legacy)

    const Tile = ({ opt }: { opt: DesignOption }) => {
        const selected = value === opt.value
        return (
            <button
                type="button"
                onClick={() => onChange(opt.value)}
                aria-pressed={selected}
                className={cn(
                    'relative p-2 rounded-xl border-2 text-left transition-all',
                    selected
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:border-primary/50 hover:bg-muted/50',
                )}
            >
                {selected && (
                    <span className="absolute top-3 right-3 z-10 rounded-full bg-primary text-primary-foreground p-0.5 shadow">
                        <Check className="h-3 w-3" />
                    </span>
                )}
                {renderPreview(opt.value)}
                <div className="font-semibold text-sm mt-2 flex items-center gap-1.5 flex-wrap">
                    {opt.label}
                    {opt.isNew && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide rounded px-1 py-px bg-primary/10 text-primary">
                            New
                        </span>
                    )}
                    {opt.legacy && <span className="text-[10px] font-normal text-muted-foreground border rounded px-1">old</span>}
                </div>
                <div className="text-xs text-muted-foreground leading-snug">{opt.desc}</div>
            </button>
        )
    }

    const Group = ({ title, icon, items }: { title: string; icon?: ReactNode; items: DesignOption[] }) =>
        items.length === 0 ? null : (
            <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    {icon}{title}
                </p>
                <div className={cn('grid gap-3', columns)}>
                    {items.map(o => <Tile key={o.value} opt={o} />)}
                </div>
            </div>
        )

    return (
        <div className="space-y-5">
            <Group
                title="Most picked"
                icon={<Sparkles className="h-3.5 w-3.5" />}
                items={popular}
            />
            <Group title={popular.length ? 'Other looks' : 'Looks'} items={more} />
            <Group title="Older looks" items={older} />

            {!showLegacy && options.some(o => o.legacy && o.value !== value) && (
                <button
                    type="button"
                    onClick={() => setShowLegacy(true)}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                    {legacyLabel}
                </button>
            )}
        </div>
    )
}
