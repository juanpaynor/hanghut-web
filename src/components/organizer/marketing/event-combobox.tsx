'use client'

import { useMemo, useState } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

export interface EventComboboxItem {
    id: string
    title: string
    start_datetime: string
    tickets_sold: number
}

/**
 * Searchable event picker. Scales to large event lists via type-ahead filtering
 * and an Upcoming/Past split. For attendee-targeted use (`attendeesOnly`), events
 * with no ticket sales are hidden by default — emailing them reaches nobody —
 * with a toggle to reveal the full list.
 */
export function EventCombobox({
    events,
    value,
    onChange,
    loading = false,
    placeholder = '— Choose an event —',
    attendeesOnly = false,
}: {
    events: EventComboboxItem[]
    value: string
    onChange: (id: string) => void
    loading?: boolean
    placeholder?: string
    attendeesOnly?: boolean
}) {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [showAll, setShowAll] = useState(false)

    const selected = events.find((e) => e.id === value) || null

    const { upcoming, past, hiddenCount } = useMemo(() => {
        const now = new Date()
        const q = query.trim().toLowerCase()
        const withSales = events.filter((e) => e.tickets_sold > 0)
        const hiddenCount = attendeesOnly ? events.length - withSales.length : 0

        let list = attendeesOnly && !showAll ? withSales : events
        if (q) list = list.filter((e) => e.title.toLowerCase().includes(q))

        const upcoming = list.filter((e) => new Date(e.start_datetime) >= now)
        const past = list.filter((e) => new Date(e.start_datetime) < now)
        return { upcoming, past, hiddenCount }
    }, [events, query, showAll, attendeesOnly])

    const renderRow = (e: EventComboboxItem) => (
        <button
            key={e.id}
            type="button"
            onClick={() => {
                onChange(e.id)
                setOpen(false)
                setQuery('')
            }}
            className={cn(
                'flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent',
                e.id === value && 'bg-accent'
            )}
        >
            <Check className={cn('mt-0.5 h-4 w-4 shrink-0', e.id === value ? 'opacity-100' : 'opacity-0')} />
            <span className="flex-1 min-w-0">
                <span className="block truncate font-medium">{e.title}</span>
                <span className="block text-xs text-muted-foreground">
                    {format(new Date(e.start_datetime), 'MMM d, yyyy')} · {e.tickets_sold} sold
                </span>
            </span>
        </button>
    )

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    disabled={loading}
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                >
                    <span className={cn('truncate', !selected && 'text-muted-foreground')}>
                        {loading
                            ? 'Loading events…'
                            : selected
                                ? `${selected.title} — ${format(new Date(selected.start_datetime), 'MMM d, yyyy')}`
                                : placeholder}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <div className="flex items-center border-b px-3">
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <Input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search events…"
                        className="h-10 border-0 bg-transparent px-2 focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                </div>
                <ScrollArea className="max-h-72">
                    <div className="p-1">
                        {upcoming.length === 0 && past.length === 0 ? (
                            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No events found</p>
                        ) : (
                            <>
                                {upcoming.length > 0 && (
                                    <>
                                        <p className="px-2 pt-2 pb-1 text-xs font-semibold text-muted-foreground">Upcoming</p>
                                        {upcoming.map(renderRow)}
                                    </>
                                )}
                                {past.length > 0 && (
                                    <>
                                        <p className="px-2 pt-2 pb-1 text-xs font-semibold text-muted-foreground">Past</p>
                                        {past.map(renderRow)}
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </ScrollArea>
                {attendeesOnly && hiddenCount > 0 && (
                    <button
                        type="button"
                        onClick={() => setShowAll((v) => !v)}
                        className="w-full border-t px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent"
                    >
                        {showAll
                            ? 'Hide events with no sales'
                            : `Show ${hiddenCount} event${hiddenCount !== 1 ? 's' : ''} with no sales`}
                    </button>
                )}
            </PopoverContent>
        </Popover>
    )
}
