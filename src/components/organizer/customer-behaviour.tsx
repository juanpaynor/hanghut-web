'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
    Loader2, Search, Users, Repeat, UserX, Ban, ShieldX, RotateCcw,
    CheckCircle2, XCircle, Clock, Crown, Heart, AlertTriangle, Sparkles,
    Wallet, TrendingUp, Receipt, Download, Copy, ArrowDownWideNarrow, Mail,
} from 'lucide-react'
import { format } from 'date-fns'
import { formatInManila } from '@/lib/datetime'

interface Summary {
    total_customers: number; repeat: number; first_timers: number
    no_show: number; abandoned: number; rejected: number; reengaged: number
    paying: number; total_revenue: number | string; avg_ltv: number | string; aov: number | string
    champion: number; loyal: number; at_risk: number; lost: number; new: number; active: number
}
interface Customer {
    email: string; name: string | null
    events_purchased: number; events_attended: number; no_shows: number
    abandoned_count: number; rejected_count: number; events_engaged: number
    reengaged: boolean; first_seen: string | null; last_activity: string | null
    total_spent: number | string; orders: number; aov: number | string
    recency_days: number; rfm_segment: string | null
    segments: string[]
}
interface DetailRow {
    title: string; start_datetime: string | null
    purchased: boolean; attended: boolean; noshow: boolean; abandoned: boolean; rejected: boolean
}

const PAGE = 50
const peso = (n: number | string | null | undefined) =>
    `₱${Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`

// Revenue headline stats (display only)
const STATS: { label: string; field: keyof Summary; icon: any; money?: boolean }[] = [
    { label: 'Total revenue', field: 'total_revenue', icon: Wallet, money: true },
    { label: 'Avg. lifetime value', field: 'avg_ltv', icon: TrendingUp, money: true },
    { label: 'Avg. order value', field: 'aov', icon: Receipt, money: true },
    { label: 'Paying customers', field: 'paying', icon: Users },
]

// Value/RFM segments (click to filter)
const RFM_CARDS: { key: string | null; label: string; field: keyof Summary; icon: any; color: string }[] = [
    { key: null, label: 'All customers', field: 'total_customers', icon: Users, color: 'text-foreground' },
    { key: 'champion', label: 'Champions', field: 'champion', icon: Crown, color: 'text-emerald-600' },
    { key: 'loyal', label: 'Loyal', field: 'loyal', icon: Heart, color: 'text-indigo-600' },
    { key: 'new', label: 'New', field: 'new', icon: Sparkles, color: 'text-sky-600' },
    { key: 'at_risk', label: 'At risk', field: 'at_risk', icon: AlertTriangle, color: 'text-amber-600' },
    { key: 'lost', label: 'Lost', field: 'lost', icon: UserX, color: 'text-rose-600' },
]

// Behavioral filters (secondary chips)
const BEHAVIOR_CHIPS: { key: string; label: string; field: keyof Summary }[] = [
    { key: 'repeat', label: 'Repeat', field: 'repeat' },
    { key: 'no_show', label: 'No-shows', field: 'no_show' },
    { key: 'abandoned', label: 'Abandoned', field: 'abandoned' },
    { key: 'rejected', label: 'Rejected', field: 'rejected' },
    { key: 'reengaged', label: 'Re-engaged', field: 'reengaged' },
]

const BADGES: Record<string, { label: string; cls: string }> = {
    champion:  { label: 'Champion',   cls: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' },
    loyal:     { label: 'Loyal',      cls: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/30' },
    new:       { label: 'New',        cls: 'bg-sky-500/10 text-sky-700 border-sky-500/30' },
    active:    { label: 'Active',     cls: 'bg-slate-500/10 text-slate-700 border-slate-500/30' },
    at_risk:   { label: 'At risk',    cls: 'bg-amber-500/10 text-amber-700 border-amber-500/30' },
    lost:      { label: 'Lost',       cls: 'bg-rose-500/10 text-rose-700 border-rose-500/30' },
    no_show:   { label: 'No-show',    cls: 'bg-amber-500/10 text-amber-700 border-amber-500/30' },
    abandoned: { label: 'Abandoned',  cls: 'bg-orange-500/10 text-orange-700 border-orange-500/30' },
    rejected:  { label: 'Rejected',   cls: 'bg-red-500/10 text-red-700 border-red-500/30' },
    reengaged: { label: 'Re-engaged', cls: 'bg-violet-500/10 text-violet-700 border-violet-500/30' },
}
// Badges to render in the table (rfm segment shown separately; skip the redundant 'repeat').
function tableBadges(c: Customer): string[] {
    return c.segments.filter((s) => BADGES[s] && s !== c.rfm_segment && s !== 'repeat')
}

export function CustomerBehaviour({ partnerId }: { partnerId: string }) {
    const { toast } = useToast()
    const router = useRouter()
    const [summary, setSummary] = useState<Summary | null>(null)
    const [customers, setCustomers] = useState<Customer[]>([])
    const [total, setTotal] = useState(0)
    const [segment, setSegment] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [appliedSearch, setAppliedSearch] = useState('')
    const [sort, setSort] = useState<'recent' | 'spend'>('recent')
    const [page, setPage] = useState(0)
    const [loading, setLoading] = useState(true)
    const [exporting, setExporting] = useState(false)
    const [detail, setDetail] = useState<{ customer: Customer; rows: DetailRow[] | null } | null>(null)
    // Hand-picked selection (by email) for emailing specific customers.
    const [selected, setSelected] = useState<Record<string, { email: string; first_name?: string }>>({})

    const load = useCallback(async () => {
        setLoading(true)
        const supabase = createClient()
        const { data } = await supabase.rpc('get_organizer_customers', {
            p_partner_id: partnerId,
            p_segment: segment,
            p_search: appliedSearch || null,
            p_limit: PAGE,
            p_offset: page * PAGE,
            p_sort: sort,
        })
        if (data) {
            setSummary(data.summary)
            setCustomers(data.customers || [])
            setTotal(data.total || 0)
        }
        setLoading(false)
    }, [partnerId, segment, appliedSearch, page, sort])

    useEffect(() => { load() }, [load])

    useEffect(() => {
        const t = setTimeout(() => { setPage(0); setAppliedSearch(search.trim()) }, 400)
        return () => clearTimeout(t)
    }, [search])

    // Fetch the full current selection (all pages) for export / copy.
    async function fetchAll(): Promise<Customer[]> {
        const supabase = createClient()
        const { data } = await supabase.rpc('get_organizer_customers', {
            p_partner_id: partnerId, p_segment: segment, p_search: appliedSearch || null,
            p_limit: 5000, p_offset: 0, p_sort: sort,
        })
        return (data?.customers as Customer[]) || []
    }

    async function exportCsv() {
        setExporting(true)
        try {
            const rows = await fetchAll()
            const head = ['Name', 'Email', 'Segment', 'Events bought', 'Attended', 'No-shows', 'Total spent', 'Avg order', 'First seen', 'Last activity']
            const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
            const fmt = (d: string | null) => (d ? format(new Date(d), 'yyyy-MM-dd') : '')
            const body = rows.map((c) => [
                c.name || '', c.email, c.rfm_segment || '', c.events_purchased, c.events_attended,
                c.no_shows, Number(c.total_spent || 0), Number(c.aov || 0), fmt(c.first_seen), fmt(c.last_activity),
            ].map(esc).join(','))
            const csv = [head.map(esc).join(','), ...body].join('\n')
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `customers-${segment || 'all'}-${format(new Date(), 'yyyy-MM-dd')}.csv`
            a.click()
            URL.revokeObjectURL(url)
            toast({ title: 'Exported', description: `${rows.length} customers downloaded as CSV.` })
        } catch {
            toast({ title: 'Export failed', description: 'Please try again.', variant: 'destructive' })
        } finally {
            setExporting(false)
        }
    }

    async function copyEmails() {
        setExporting(true)
        try {
            const rows = await fetchAll()
            const emails = rows.map((c) => c.email).filter(Boolean)
            await navigator.clipboard.writeText(emails.join(', '))
            toast({ title: 'Emails copied', description: `${emails.length} email${emails.length !== 1 ? 's' : ''} copied to clipboard.` })
        } catch {
            toast({ title: 'Copy failed', description: 'Please try again.', variant: 'destructive' })
        } finally {
            setExporting(false)
        }
    }

    // ─── Hand-picked selection ──────────────────────────────────────────
    const firstNameOf = (c: Customer) => (c.name?.trim().split(/\s+/)[0]) || undefined
    const selectedCount = Object.keys(selected).length
    const pageEmails = customers.map((c) => c.email)
    const allPageSelected = customers.length > 0 && pageEmails.every((e) => selected[e])

    function toggleOne(c: Customer) {
        setSelected((prev) => {
            const next = { ...prev }
            if (next[c.email]) delete next[c.email]
            else next[c.email] = { email: c.email, first_name: firstNameOf(c) }
            return next
        })
    }
    function togglePage() {
        setSelected((prev) => {
            const next = { ...prev }
            if (allPageSelected) {
                for (const c of customers) delete next[c.email]
            } else {
                for (const c of customers) next[c.email] = { email: c.email, first_name: firstNameOf(c) }
            }
            return next
        })
    }
    // Hand off the picked list to the composer via sessionStorage (too many for a URL).
    function emailSelected() {
        const list = Object.values(selected)
        if (list.length === 0) return
        try { sessionStorage.setItem('hh:email-recipients', JSON.stringify(list)) } catch { /* non-fatal */ }
        router.push('/organizer/marketing?recipients=selected')
    }

    async function openDetail(c: Customer) {
        setDetail({ customer: c, rows: null })
        const supabase = createClient()
        const { data } = await supabase.rpc('get_organizer_customer_detail', { p_partner_id: partnerId, p_email: c.email })
        setDetail({ customer: c, rows: (data as DetailRow[]) ?? [] })
    }

    const totalPages = Math.ceil(total / PAGE)

    return (
        <div className="space-y-6">
            {/* Revenue headline */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {STATS.map((s) => (
                    <Card key={s.label} className="p-4">
                        <s.icon className="h-4 w-4 mb-2 text-primary" />
                        <p className="text-2xl font-bold">
                            {summary ? (s.money ? peso(summary[s.field] as number) : Number(summary[s.field]).toLocaleString()) : '—'}
                        </p>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                    </Card>
                ))}
            </div>

            {/* Value / RFM segments (click to filter) */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {RFM_CARDS.map((c) => {
                    const active = segment === c.key
                    return (
                        <button
                            key={c.label}
                            onClick={() => { setPage(0); setSegment(c.key) }}
                            className={`text-left rounded-xl border p-4 transition-all hover:border-primary/50 ${active ? 'border-primary ring-1 ring-primary bg-primary/5' : 'bg-card'}`}
                        >
                            <c.icon className={`h-4 w-4 mb-2 ${c.color}`} />
                            <p className="text-2xl font-bold">{summary ? Number(summary[c.field]).toLocaleString() : '—'}</p>
                            <p className="text-xs text-muted-foreground">{c.label}</p>
                        </button>
                    )
                })}
            </div>

            {/* Behavioral chips */}
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground mr-1">Also:</span>
                {BEHAVIOR_CHIPS.map((b) => {
                    const active = segment === b.key
                    const count = summary ? Number(summary[b.field]) : 0
                    return (
                        <button
                            key={b.key}
                            onClick={() => { setPage(0); setSegment(active ? null : b.key) }}
                            className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${active ? 'border-primary bg-primary/10 text-primary' : 'bg-card hover:bg-muted text-muted-foreground'}`}
                        >
                            {b.label}{count ? ` · ${count}` : ''}
                        </button>
                    )
                })}
            </div>

            {/* Toolbar: search · sort · actions */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative max-w-sm flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline" size="sm"
                        onClick={() => { setPage(0); setSort((s) => (s === 'spend' ? 'recent' : 'spend')) }}
                        className="gap-1.5"
                        title="Toggle sort"
                    >
                        <ArrowDownWideNarrow className="h-4 w-4" />
                        {sort === 'spend' ? 'Top spenders' : 'Most recent'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={copyEmails} disabled={exporting || total === 0} className="gap-1.5">
                        {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />} Copy emails
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting || total === 0} className="gap-1.5">
                        {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export CSV
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => router.push(`/organizer/marketing?segment=${segment || 'customers'}`)}
                        disabled={total === 0}
                        className="gap-1.5"
                    >
                        <Mail className="h-4 w-4" /> Email segment
                    </Button>
                </div>
            </div>

            {/* Selection action bar */}
            {selectedCount > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                    <p className="text-sm font-medium">
                        {selectedCount} customer{selectedCount !== 1 ? 's' : ''} selected
                    </p>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setSelected({})}>Clear</Button>
                        <Button size="sm" onClick={emailSelected} className="gap-1.5">
                            <Mail className="h-4 w-4" /> Email selected
                        </Button>
                    </div>
                </div>
            )}

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
                                    <th className="px-4 py-2.5 w-10">
                                        <input
                                            type="checkbox"
                                            checked={allPageSelected}
                                            onChange={togglePage}
                                            className="h-4 w-4 rounded border-input accent-[#4E47DC] cursor-pointer align-middle"
                                            title="Select all on this page"
                                        />
                                    </th>
                                    <th className="px-4 py-2.5 font-medium">Customer</th>
                                    <th className="px-4 py-2.5 font-medium text-right">Total spent</th>
                                    <th className="px-4 py-2.5 font-medium text-right">Bought</th>
                                    <th className="px-4 py-2.5 font-medium text-right">Attended</th>
                                    <th className="px-4 py-2.5 font-medium">Segments</th>
                                    <th className="px-4 py-2.5 font-medium">Last activity</th>
                                </tr>
                            </thead>
                            <tbody>
                                {customers.map((c) => (
                                    <tr key={c.email} onClick={() => openDetail(c)} className={`border-b last:border-0 hover:bg-muted/40 cursor-pointer ${selected[c.email] ? 'bg-primary/5' : ''}`}>
                                        <td className="px-4 py-3" onClick={(e) => { e.stopPropagation(); toggleOne(c) }}>
                                            <input
                                                type="checkbox"
                                                checked={!!selected[c.email]}
                                                onChange={() => {}}
                                                className="h-4 w-4 rounded border-input accent-[#4E47DC] cursor-pointer align-middle pointer-events-none"
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="font-medium">{c.name || c.email}</p>
                                            {c.name && <p className="text-xs text-muted-foreground">{c.email}</p>}
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{peso(c.total_spent)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums">{c.events_purchased}</td>
                                        <td className="px-4 py-3 text-right tabular-nums">{c.events_attended}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-wrap gap-1">
                                                {c.rfm_segment && BADGES[c.rfm_segment] && (
                                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${BADGES[c.rfm_segment].cls}`}>{BADGES[c.rfm_segment].label}</span>
                                                )}
                                                {tableBadges(c).map((s) => (
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
                        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                        <span className="text-muted-foreground">{page + 1} / {totalPages}</span>
                        <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
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
                                {detail.customer.rfm_segment && BADGES[detail.customer.rfm_segment] && (
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded border ${BADGES[detail.customer.rfm_segment].cls}`}>{BADGES[detail.customer.rfm_segment].label}</span>
                                )}
                                {tableBadges(detail.customer).map((s) => (
                                    <span key={s} className={`text-xs font-medium px-2 py-0.5 rounded border ${BADGES[s].cls}`}>{BADGES[s].label}</span>
                                ))}
                            </div>
                            <div className="grid grid-cols-4 gap-3 text-center">
                                <div className="rounded-lg border p-2"><p className="text-base font-bold">{peso(detail.customer.total_spent)}</p><p className="text-xs text-muted-foreground">Spent</p></div>
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
                                                    {r.start_datetime && <p className="text-xs text-muted-foreground">{formatInManila(r.start_datetime, { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
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
