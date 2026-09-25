'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Choice options rendered as picture cards.
 *
 * A `<select>` cannot show an image, so a question that has pictures for its
 * options is rendered as a grid instead of a dropdown — the picture IS the
 * question ("which of these shirts?"), and hiding it behind a menu defeats the
 * point. Without pictures the callers keep their existing controls; this is
 * only reached when at least one option has one.
 *
 * Images are keyed by option LABEL, and the label is still what gets stored as
 * the answer. Exports, stats and the app see exactly what they saw before.
 */
export function OptionImagePicker({
    options, images, value, multiple, onChange, columns = 3,
}: {
    options: string[]
    images: Record<string, string>
    /** A single label, or the selected labels when `multiple`. */
    value: string | string[]
    multiple?: boolean
    onChange: (v: string | string[]) => void
    columns?: 2 | 3
}) {
    const selected = Array.isArray(value) ? value : value ? [value] : []

    function toggle(opt: string) {
        if (!multiple) {
            onChange(opt)
            return
        }
        onChange(selected.includes(opt)
            ? selected.filter(o => o !== opt)
            : [...selected, opt])
    }

    return (
        <div className={cn(
            'grid gap-2.5',
            columns === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'
        )}>
            {options.map(opt => {
                const on = selected.includes(opt)
                const src = images[opt]
                return (
                    <button
                        key={opt}
                        type="button"
                        onClick={() => toggle(opt)}
                        aria-pressed={on}
                        className={cn(
                            'group relative overflow-hidden rounded-xl border-2 text-left transition-all',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            on ? 'border-primary' : 'border-border hover:border-primary/40'
                        )}
                    >
                        {src ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={src}
                                alt={opt}
                                loading="lazy"
                                className="aspect-square w-full bg-muted object-cover"
                            />
                        ) : (
                            // An option with no picture still has to be pickable,
                            // and must not collapse to a different height than
                            // the ones beside it.
                            <span className="flex aspect-square w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                                No image
                            </span>
                        )}

                        <span className={cn(
                            'flex items-center gap-1.5 px-2.5 py-2 text-sm',
                            on ? 'bg-primary/5 font-medium' : ''
                        )}>
                            <span className={cn(
                                'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                                on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'
                            )}>
                                {on && <Check className="h-2.5 w-2.5" />}
                            </span>
                            <span className="truncate">{opt}</span>
                        </span>
                    </button>
                )
            })}
        </div>
    )
}

/** True when this question should be shown as picture cards. */
export function hasOptionImages(images: unknown): images is Record<string, string> {
    return !!images
        && typeof images === 'object'
        && !Array.isArray(images)
        && Object.values(images as Record<string, unknown>).some(v => typeof v === 'string' && v.trim() !== '')
}
