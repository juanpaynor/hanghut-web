'use client'

import { useEffect, useState, useTransition } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Bookmark, BookmarkCheck, Copy, Loader2, Star, Trash2 } from 'lucide-react'
import {
    listReusableEventDesigns, getBrandDesignDefault, saveBrandDesignDefault,
    type EventDesign, type ReusableDesign,
} from '@/lib/organizer/event-design-actions'

/**
 * "Use a look I already have" — the first thing in the Design tab.
 *
 * Prod says this is the single most-repeated action on the platform: Mimic
 * Manila rebuilt the same design 36 times because there was no way to say
 * "like the last one". So before the organizer is offered twelve layouts and
 * nine backgrounds, they get offered the two answers they usually want — their
 * house look, and their previous events.
 */
export function DesignReusePanel({
    eventId,
    currentDesign,
    onApply,
}: {
    eventId: string
    /** Read lazily so it reflects unsaved edits at the moment Save is pressed. */
    currentDesign: () => EventDesign
    onApply: (design: EventDesign, label: string) => void
}) {
    const { toast } = useToast()
    const [loading, setLoading] = useState(true)
    const [designs, setDesigns] = useState<ReusableDesign[]>([])
    const [brandDefault, setBrandDefault] = useState<EventDesign | null>(null)
    const [saving, startSaving] = useTransition()

    useEffect(() => {
        let alive = true
        Promise.all([listReusableEventDesigns(eventId), getBrandDesignDefault()])
            .then(([past, brand]) => {
                if (!alive) return
                if (past.designs) setDesigns(past.designs)
                if (brand.design) setBrandDefault(brand.design)
            })
            .finally(() => { if (alive) setLoading(false) })
        return () => { alive = false }
    }, [eventId])

    const saveAsDefault = () => {
        const design = currentDesign()
        startSaving(async () => {
            const res = await saveBrandDesignDefault(design)
            if (res.error) {
                toast({ title: 'Could not save', description: res.error, variant: 'destructive' })
                return
            }
            setBrandDefault(design)
            toast({
                title: 'Saved as your house look',
                description: 'New events will start from this. Existing events are untouched.',
            })
        })
    }

    const clearDefault = () => {
        startSaving(async () => {
            const res = await saveBrandDesignDefault(null)
            if (res.error) {
                toast({ title: 'Could not clear', description: res.error, variant: 'destructive' })
                return
            }
            setBrandDefault(null)
            toast({ title: 'House look cleared' })
        })
    }

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                <Loader2 className="h-4 w-4 animate-spin" />
                Looking for designs you can reuse…
            </div>
        )
    }

    const nothingToReuse = !brandDefault && designs.length === 0

    return (
        <div className="space-y-5">
            {/* ── House look ─────────────────────────────────────────────── */}
            <div className={cn(
                'rounded-xl border p-4 space-y-3',
                brandDefault ? 'bg-primary/5 border-primary/30' : 'bg-muted/40',
            )}>
                <div className="flex items-start gap-3">
                    {brandDefault
                        ? <BookmarkCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        : <Bookmark className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />}
                    <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm">
                            {brandDefault ? 'Your house look' : 'No house look saved yet'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {brandDefault
                                ? 'Every new event starts from this. Change it any time — events already published keep the look they were published with.'
                                : 'Set this event up how you like it, then save it as your house look so you never build it again.'}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    {brandDefault && (
                        <Button
                            type="button" size="sm" variant="outline"
                            onClick={() => onApply(brandDefault, 'your house look')}
                        >
                            <Star className="mr-2 h-4 w-4" />
                            Apply to this event
                        </Button>
                    )}
                    <Button type="button" size="sm" onClick={saveAsDefault} disabled={saving}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bookmark className="mr-2 h-4 w-4" />}
                        {brandDefault ? 'Update to what I have now' : 'Save this as my house look'}
                    </Button>
                    {brandDefault && (
                        <Button type="button" size="sm" variant="ghost" onClick={clearDefault} disabled={saving}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Clear
                        </Button>
                    )}
                </div>
            </div>

            {/* ── Copy from a past event ─────────────────────────────────── */}
            {designs.length > 0 && (
                <div className="space-y-2">
                    <div>
                        <p className="text-sm font-semibold">Copy a look from a past event</p>
                        <p className="text-xs text-muted-foreground">
                            Brings over the layout, colours, fonts and section order — never the poster,
                            text or tickets.
                        </p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {designs.map(d => (
                            <button
                                key={d.eventId}
                                type="button"
                                onClick={() => onApply(d.design, d.title)}
                                className="flex items-center gap-3 rounded-lg border bg-background p-2 text-left hover:border-primary/50 hover:bg-muted/50 transition-colors"
                            >
                                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
                                    {d.coverImageUrl && (
                                        <Image src={d.coverImageUrl} alt="" fill sizes="48px" className="object-cover" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{d.title}</p>
                                    <p className="truncate text-xs text-muted-foreground">{d.summary}</p>
                                </div>
                                <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {nothingToReuse && (
                <p className="text-xs text-muted-foreground">
                    Once you design an event, it shows up here so your next one takes a single click.
                </p>
            )}
        </div>
    )
}
