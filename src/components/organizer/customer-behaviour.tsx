'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
    Loader2, Search, Users, Repeat, UserX, Ban, ShieldX, RotateCcw,
    CheckCircle2, XCircle, Clock,
} from 'lucide-react'
import { format } from 'date-fns'

interface Summary {
    total_customers: number; repeat: number; first_timers: number
    no_show: number; abandoned: number; rejected: number; reengaged: number
}
interface Customer {
    email: string; name: string | null
    events_purchased: number; events_attended: number; no_shows: number
    abandoned_count: number; rejected_count: number; events_engaged: number
    reengaged: boolean; first_seen: string | null; last_activity: string | null
    segments: string[]
}
interface DetailRow {
    title: string; start_datetime: string | null
    purchased: boolean; attended: boolean; noshow: boolean; abandoned: boolean; rejected: boolean
}

const PAGE = 50

const CARDS: { key: string | null; label: string; field: keyof Summary; icon: any; color: string }[] = [
    { key: null, label: 'Customers', field: 'total_customers', icon: Users, color: 'text-foreground' },
    { key: 'repeat', label: 'Repeat', field: 'repeat', icon: Repeat, color: 'text-emerald-600' },
    { key: 'no_show', label: 'No-shows', field: 'no_show', icon: UserX, color: 'text-amber-600' },
    { key: 'abandoned', label: 'Abandoned', field: 'abandoned', icon: Ban, color: 'text-orange-600' },
    { key: 'rejected', label: 'Rejected', field: 'rejected', icon: ShieldX, color: 'text-red-600' },
    { key: 'reengaged', label: 'Re-engaged', field: 'reengaged', icon: RotateCcw, color: 'text-violet-600' },
]

const BADGES: Record<string, { label: string; cls: string }> = {
    repeat:    { label: 'Repeat',     cls: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' },
    no_show:   { label: 'No-show',    cls: 'bg-amber-500/10 text-amber-700 border-amber-500/30' },
    abandoned: { label: 'Abandoned',  cls: 'bg-orange-500/10 text-orange-700 border-orange-500/30' },
    rejected:  { label: 'Rejected',   cls: 'bg-red-500/10 text-red-700 border-red-500/30' },
    reengaged: { label: 'Re-engaged', cls: 'bg-violet-500/10 text-violet-700 border-violet-500/30' },
}

export function CustomerBehaviour({ partnerId }: { partnerId: string }) {
    const [summary, setSummary] = useState<Summary | null>(null)
    const [customers, setCustomers] = useState<Customer[]>([])
    const [total, setTotal] = useState(0)
    const [segment, setSegment] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [appliedSearch, setAppliedSearch] = useState('')
    const [page, setPage] = useState(0)
    const [loading, setLoading] = useState(true)
    const [detail, setDetail] = useState<{ customer: Customer; rows: DetailRow[] | null } | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        const supabase = createClient()
        const { data } = await supabase.rpc('get_organizer_customers', {
            p_partner_id: partnerId,
            p_segment: segment,
            p_search: appliedSearch || null,
            p_limit: PAGE,
            p_offset: page * PAGE,
        })
        if (data) {
            setSummary(data.summary)
            setCustomers(data.customers || [])
            setTotal(data.total || 0)
        }
        setLoading(false)
    }, [partnerId, segment, appliedSearch, page])

    useEffect(() => { load() }, [load])

    // debounce search
    useEffect(() => {
        const t = setTimeout(() => { setPage(0); setAppliedSearch(search.trim()) }, 400)
        return () => clearTimeout(t)
    }, [search])

    async function openDetail(c: Customer) {
        setDetail({ customer: c, rows: null })
        const supabase = createClient()
        const { data } = await supabase.rpc('get_organizer_customer_detail', { p_partner_id: partnerId, p_email: c.email })
        setDetail({ customer: c, rows: (data as DetailRow[]) ?? [] })
    }

    const totalPages = Math.ceil(total / PAGE)

    return (
        <div className="space-y-6">
            {/* Segment cards (click to filter) */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {CARDS.map(c => {
                    const active = segment === c.key
                    return (
                        <button
                            key={c.label}
                            onClick={() => { setPage(0); setSegment(c.key) }}
                            className={`text-left rounded-xl border p-4 transition-all hover:border-primary/50 ${active ? 'border-primary ring-1 ring-primary bg-primary/5' : 'bg-card'}`}
                        >
                            <c.icon className={`h-4 w-4 mb-2 ${c.color}`} />
                            <p className="text-2xl font-bold">{summary ? summary[c.field].toLocaleString() : '—'}</p>
                            <p className="text-xs text-muted-foreground">{c.label}</p>
                        </button>
                    )
                })}
            </div>

            {/* Search */}
            <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search by name or email…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                />
            </div>

            {/* Table */}
            <Card className="overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : customers.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-16">No customers in this view yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-muted-foreground border-b bg-muted/30">
                                    <th className="px-4 py-2.5 font-medium">Customer</th>
                                    <th className="px-4 py-2.5 font-medium text-right">Bought</th>
                                    <th className="px-4 py-2.5 font-medium text-right">Attended</th>
                                    <th className="px-4 py-2.5 font-medium text-right">No-shows</th>
                                    <th className="px-4 py-2.5 font-medium">Segments</th>
                                    <th className="px-4 py-2.5 font-medium">Last activity</th>
                                </tr>
                            </thead>
                            <tbody>
                                {customers.map(c => (
                                    <tr key={c.email} onClick={() => openDetail(c)} className="border-b last:border-0 hover:bg-muted/40 cursor-pointer">
                                        <td className="px-4 py-3">
                                            <p className="font-medium">{c.name || c.email}</p>
                                            {c.name && <p className="text-xs text-muted-foreground">{c.email}</p>}
                                        </td>
                                        <td className="px-4 py-3 text-right">{c.events_purchased}</td>
                                        <td className="px-4 py-3 text-right">{c.events_attended}</td>
                                        <td className="px-4 py-3 text-right">{c.no_shows > 0 ? <span className="text-amber-600 font-medium">{c.no_shows}</span> : '0'}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-wrap gap-1">
                                                {c.segments.filter(s => BADGES[s]).map(s => (
                                                    <span key={s} className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${BADGES[s].cls}`}>{BADGES[s].label}</span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground text-xs">
                                            {c.last_activity ? format(new Date(c.last_activity), 'MMM d, yyyy') : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{total.toLocaleString()} customers</span>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
                        <span className="text-muted-foreground">{page + 1} / {totalPages}</span>
                        <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
                    </div>
                </div>
            )}

            {/* Drill-down */}
            <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null) }}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{detail?.customer.name || detail?.customer.email}</DialogTitle>
                    </DialogHeader>
                    {detail && (
                        <div className="space-y-4">
                            {detail.customer.name && <p className="text-sm text-muted-foreground -mt-2">{detail.customer.email}</p>}
                            <div className="flex flex-wrap gap-1.5">
                                {detail.customer.segments.filter(s => BADGES[s]).map(s => (
                                    <span key={s} className={`text-xs font-medium px-2 py-0.5 rounded border ${BADGES[s].cls}`}>{BADGES[s].label}</span>
                                ))}
                            </div>
                            <div className="grid grid-cols-3 gap-3 text-center">
                                <div className="rounded-lg border p-2"><p className="text-lg font-bold">{detail.customer.events_purchased}</p><p className="text-xs text-muted-foreground">Bought</p></div>
                                <div className="rounded-lg border p-2"><p className="text-lg font-bold">{detail.customer.events_attended}</p><p className="text-xs text-muted-foreground">Attended</p></div>
                                <div className="rounded-lg border p-2"><p className="text-lg font-bold">{detail.customer.no_shows}</p><p className="text-xs text-muted-foreground">No-shows</p></div>
                            </div>
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Event history</p>
                                {detail.rows === null ? (
                                    <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                                ) : detail.rows.length === 0 ? (
                                    <p className="text-sm text-muted-foreground py-2">No event history.</p>
                                ) : (
                                    <ul className="space-y-2 max-h-64 overflow-y-auto">
                                        {detail.rows.map((r, i) => (
                                            <li key={i} className="flex items-center justify-between gap-3 text-sm border-b last:border-0 pb-2">
                                                <div className="min-w-0">
                                                    <p className="font-medium truncate">{r.title}</p>
                                                    {r.start_datetime && <p className="text-xs text-muted-foreground">{format(new Date(r.start_datetime), 'MMM d, yyyy')}</p>}
                                                </div>
                                                <span className="shrink-0">
                                                    {r.attended ? <span className="inline-flex items-center gap-1 text-emerald-600 text-xs"><CheckCircle2 className="h-3.5 w-3.5" /> Attended</span>
                                                        : r.noshow ? <span className="inline-flex items-center gap-1 text-amber-600 text-xs"><Clock className="h-3.5 w-3.5" /> No-show</span>
                                                        : r.rejected ? <span className="inline-flex items-center gap-1 text-red-600 text-xs"><XCircle className="h-3.5 w-3.5" /> Rejected</span>
                                                        : r.purchased ? <span className="inline-flex items-center gap-1 text-foreground text-xs"><CheckCircle2 className="h-3.5 w-3.5" /> Bought</span>
                                                        : r.abandoned ? <span className="inline-flex items-center gap-1 text-orange-600 text-xs"><Ban className="h-3.5 w-3.5" /> Abandoned</span>
                                                        : <span className="text-muted-foreground text-xs">—</span>}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
