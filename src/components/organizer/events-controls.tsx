'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
    { key: 'all', label: 'All' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'past', label: 'Past' },
    { key: 'draft', label: 'Drafts' },
    { key: 'cancelled', label: 'Cancelled' },
]

/**
 * URL-driven filter/sort/search controls for the organizer's My Events list.
 * Pushes params (status, sort, q) and resets pagination; the server page reads
 * them and queries accordingly.
 */
export function EventsControls({ status, sort, q }: { status: string; sort: string; q: string }) {
    const router = useRouter()
    const params = useSearchParams()
    const [search, setSearch] = useState(q)

    const setParam = useCallback((updates: Record<string, string | null>) => {
        const p = new URLSearchParams(params.toString())
        for (const [k, v] of Object.entries(updates)) {
            if (v) p.set(k, v)
            else p.delete(k)
        }
        p.delete('page') // any filter change returns to page 1
        router.push(`/organizer/events?${p.toString()}`)
    }, [params, router])

    // Debounced search → URL
    useEffect(() => {
        const t = setTimeout(() => {
            if (search !== q) setParam({ q: search || null })
        }, 350)
        return () => clearTimeout(t)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search])

    return (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Status tabs */}
            <div className="flex flex-wrap gap-2">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        onClick={() => setParam({ status: t.key === 'all' ? null : t.key })}
                        className={cn(
                            'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                            status === t.key
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground'
                        )}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Search + sort */}
            <div className="flex items-center gap-2">
                <div className="relative flex-1 lg:flex-none">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search events…"
                        className="w-full pl-8 lg:w-56"
                    />
                </div>
                <Select value={sort} onValueChange={(v) => setParam({ sort: v })}>
                    <SelectTrigger className="w-44 shrink-0">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="date_desc">Date: Latest first</SelectItem>
                        <SelectItem value="date_asc">Date: Soonest first</SelectItem>
                        <SelectItem value="created">Recently created</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    )
}
