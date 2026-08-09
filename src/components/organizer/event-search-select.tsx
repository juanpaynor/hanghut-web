'use client'

import { useMemo, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useDebounce } from '@/hooks/use-debounce'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface EventOption {
    id: string
    title: string
    start_datetime?: string | null
}

interface Props {
    events: EventOption[]
    value: string
    onChange: (id: string) => void
    placeholder?: string
}

function fmtDate(iso?: string | null): string {
    if (!iso) return ''
    try {
        return new Intl.DateTimeFormat('en-PH', {
            timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric',
        }).format(new Date(iso))
    } catch { return '' }
}

/**
 * Searchable, debounced event picker. Events are already loaded client-side, so
 * filtering is in-memory — the debounce keeps the list from re-filtering on every
 * keystroke and keeps typing snappy for organizers with many events.
 */
export function EventSearchSelect({ events, value, onChange, placeholder = 'Choose an event...' }: Props) {
    const [open, setOpen] = useState(false)
    const [searchInput, setSearchInput] = useState('')
    const query = useDebounce(searchInput, 200)

    const selected = events.find((e) => e.id === value)

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return events
        return events.filter((e) => e.title?.toLowerCase().includes(q))
    }, [events, query])

    return (
        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearchInput('') }}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal"
                >
                    <span className={cn('truncate', !selected && 'text-muted-foreground')}>
                        {selected ? selected.title : placeholder}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <div className="flex items-center gap-2 border-b px-3">
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <Input
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="Search events..."
                        autoFocus
                        className="h-10 border-0 px-0 shadow-none focus-visible:ring-0"
                    />
                </div>
                <div className="max-h-64 overflow-y-auto p-1">
                    {filtered.length === 0 ? (
                        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                            No events found.
                        </p>
                    ) : (
                        filtered.map((evt) => {
                            const isSelected = evt.id === value
                            const date = fmtDate(evt.start_datetime)
                            return (
                                <button
                                    key={evt.id}
                                    type="button"
                                    onClick={() => { onChange(evt.id); setOpen(false); setSearchInput('') }}
                                    className={cn(
                                        'flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm transition-colors hover:bg-accent',
                                        isSelected && 'bg-accent'
                                    )}
                                >
                                    <Check className={cn('h-4 w-4 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
                                    <span className="min-w-0 flex-1 truncate">{evt.title}</span>
                                    {date && <span className="shrink-0 text-xs text-muted-foreground">{date}</span>}
                                </button>
                            )
                        })
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}
