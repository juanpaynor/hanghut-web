'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Star, Ban, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
    setEventFeatured,
    setEventStatus,
    ADMIN_SETTABLE_STATUSES,
    type AdminSettableStatus,
} from '@/lib/admin/event-controls'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

/**
 * Admin actions for a single event.
 *
 * The buttons this replaces were purely decorative — rendered in a SERVER
 * component with no onClick, no form action and no server action behind them, so
 * "Feature Event" and "Cancel Event" had never done anything at all.
 *
 * Feature is now real. Cancel is deliberately still inert, see below.
 */
const STATUS_COPY: Record<AdminSettableStatus, { label: string; hint: string }> = {
    active: { label: 'Active', hint: 'Live and listed on /events.' },
    hidden: { label: 'Hidden', hint: 'Unlisted, but anyone with the link can still open it.' },
    paused: { label: 'Paused', hint: 'Listed, but not taking new orders.' },
    draft:  { label: 'Draft',  hint: 'Not published. Only the organizer can see it.' },
}

export function EventAdminActions({
    eventId,
    isFeatured,
    status,
}: {
    eventId: string
    isFeatured: boolean
    status: string
}) {
    const [featured, setFeatured] = useState(isFeatured)
    const [current, setCurrent] = useState(status)
    const [pending, startTransition] = useTransition()
    const [savingStatus, setSavingStatus] = useState(false)
    const { toast } = useToast()

    // Cancelled / sold_out / completed are not admin-settable, so an event
    // already in one of those shows a read-only note instead of a broken picker.
    const locked = !ADMIN_SETTABLE_STATUSES.includes(current as AdminSettableStatus)

    const changeStatus = (next: string) => {
        const prev = current
        setCurrent(next)
        setSavingStatus(true)
        startTransition(async () => {
            const res = await setEventStatus(eventId, next as AdminSettableStatus)
            setSavingStatus(false)
            if ('error' in res) {
                setCurrent(prev)
                toast({ title: 'Could not update', description: res.error, variant: 'destructive' })
            } else {
                toast({
                    title: `Status set to ${STATUS_COPY[next as AdminSettableStatus].label}`,
                    description: STATUS_COPY[next as AdminSettableStatus].hint,
                })
            }
        })
    }

    const toggleFeatured = () => {
        const next = !featured
        setFeatured(next)
        startTransition(async () => {
            const res = await setEventFeatured(eventId, next)
            if ('error' in res) {
                setFeatured(!next)
                toast({ title: 'Could not update', description: res.error, variant: 'destructive' })
            } else {
                toast({
                    title: next ? 'Featured' : 'Removed from featured',
                    description: next
                        ? 'This event now appears in the /events hero carousel.'
                        : 'The carousel falls back to events that are already selling.',
                })
            }
        })
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium w-24 shrink-0">Visibility</span>
                {locked ? (
                    <p className="text-sm text-muted-foreground">
                        This event is <b className="text-foreground">{current.replace('_', ' ')}</b> and
                        can&rsquo;t be changed from here.
                    </p>
                ) : (
                    <>
                        <Select value={current} onValueChange={changeStatus} disabled={savingStatus}>
                            <SelectTrigger className="w-[190px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {ADMIN_SETTABLE_STATUSES.map(v => (
                                    <SelectItem key={v} value={v}>
                                        {STATUS_COPY[v].label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {savingStatus && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                        <span className="text-xs text-muted-foreground">
                            {STATUS_COPY[current as AdminSettableStatus]?.hint}
                        </span>
                    </>
                )}
            </div>

        <div className="flex flex-wrap gap-3">
            <Button
                variant="outline"
                onClick={toggleFeatured}
                disabled={pending}
                className="border-border hover:bg-muted"
            >
                {pending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                    <Star className={`h-4 w-4 mr-2 ${featured ? 'text-yellow-500 fill-yellow-500' : ''}`} />
                )}
                {featured ? 'Remove from Featured' : 'Feature Event'}
            </Button>

            {/* Left inert ON PURPOSE. Cancelling an event is a money-path action:
                this event may have sold tickets, and a real cancel has to decide
                what happens to them (refunds, ledger reversal, notifying buyers)
                before it flips a status column. Wiring this button to a bare
                status update would look like it worked while silently stranding
                paid customers. Needs its own design pass. */}
            <Button
                variant="destructive"
                disabled
                title="Not implemented — cancelling must handle refunds and buyer notification first"
            >
                <Ban className="h-4 w-4 mr-2" />
                Cancel Event
            </Button>
        </div>
        </div>
    )
}
