'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
    Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import {
    Award, Copy, Download, Eye, EyeOff, Loader2, Users, ChevronLeft, ChevronRight, Sparkles,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
    getBadgeHolders, getBadgeLoyalCore,
    type BadgeAnalytics, type BadgeHolder, type BadgeStat,
    type LoyalCoreResult, type LoyalFan,
} from '@/lib/organizer/badge-actions'

/**
 * Page sizes are per surface, not one shared number.
 *
 * The holders list owns a dedicated scrolling sheet, so 25 reads fine there. The
 * loyal core is a card sitting below everything else on the badges page, and 25
 * rows turned it into an endless scroll — worse, with 23 people it never even
 * crossed its own page boundary, so the pager stayed hidden and the list just
 * ran on. Ten keeps the card a card.
 *
 * CORE_PAGE must stay in step with the initial server fetch in
 * app/organizer/(dashboard)/badges/page.tsx: if the page ships 25 rows and this
 * says 10, page 1 renders 25 items and "1–10 of 23" underneath it.
 */
const PAGE = 25
const CORE_PAGE = 10

const SEGMENT_LABEL: Record<string, string> = {
    champion: 'Champion', loyal: 'Loyal', active: 'Active',
    new: 'New', at_risk: 'At risk', lost: 'Lost',
}

const peso = (n: number) =>
    `₱${Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`

/**
 * Money for a stat tile, which is a narrow fixed column.
 *
 * A partner's lifetime total runs to seven figures — ₱1,809,000 is ten glyphs,
 * wider than the tile, and it spilled over the one beside it. Abbreviating above
 * a million is what makes it fit; the exact figure stays available on hover and
 * is what the CSV exports, so nothing is lost, only shortened.
 */
const pesoTile = (n: number) => {
    const v = Number(n || 0)
    if (v >= 1_000_000) return `₱${(v / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`
    if (v >= 100_000) return `₱${Math.round(v / 1000).toLocaleString('en-PH')}K`
    return peso(v)
}

const csvEscape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
const day = (d: string | null) => (d ? format(new Date(d), 'yyyy-MM-dd') : '')

function download(csv: string, filename: string) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
}

/** Twelve-week award curve. Inline bars rather than a chart library — it is a
 *  shape, not a dataset, and the page should not pull a renderer for it. */
function Curve({ curve }: { curve: { week: string; awards: number }[] }) {
    if (!curve || curve.length === 0) {
        return <span className="text-xs text-muted-foreground">no awards yet</span>
    }
    const max = Math.max(...curve.map((c) => c.awards), 1)
    return (
        <div className="flex h-7 items-end gap-0.5" aria-hidden>
            {curve.map((c) => (
                <div
                    key={c.week}
                    title={`${c.week}: ${c.awards}`}
                    className="w-1.5 rounded-sm bg-primary/70"
                    style={{ height: `${Math.max(12, (c.awards / max) * 100)}%` }}
                />
            ))}
        </div>
    )
}

function Tile({ label, value, hint, title }: {
    label: string; value: string; hint?: string; title?: string
}) {
    // min-w-0 is load-bearing: a grid item defaults to min-width:auto, so it
    // refuses to shrink below its content and a long value pushes out over the
    // tile beside it instead of wrapping.
    return (
        <div className="min-w-0 rounded-xl border border-border p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
            </p>
            <p title={title} className="mt-1 break-words text-xl font-bold tabular-nums sm:text-2xl">
                {value}
            </p>
            {hint && <p className="mt-0.5 break-words text-xs text-muted-foreground">{hint}</p>}
        </div>
    )
}

function SegmentChip({ segment }: { segment: string | null }) {
    if (!segment) return <span className="text-xs text-muted-foreground">—</span>
    return (
        <Badge variant={segment === 'champion' ? 'default' : 'secondary'} className="text-[10px]">
            {SEGMENT_LABEL[segment] ?? segment}
        </Badge>
    )
}

/* ─────────────────────────── holders sheet ─────────────────────────── */

function HoldersSheet({
    organizerId, badge, onClose,
}: { organizerId: string; badge: BadgeStat | null; onClose: () => void }) {
    const { toast } = useToast()
    const [holders, setHolders] = useState<BadgeHolder[]>([])
    const [summary, setSummary] = useState<any>(null)
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(0)
    const [search, setSearch] = useState('')
    const [applied, setApplied] = useState('')
    const [sort, setSort] = useState<'recent' | 'spend' | 'name'>('recent')
    const [loading, setLoading] = useState(false)
    const [busy, setBusy] = useState(false)

    const badgeId = badge?.id ?? null

    const load = useCallback(async () => {
        if (!badgeId) return
        setLoading(true)
        const res = await getBadgeHolders(organizerId, badgeId, {
            limit: PAGE, offset: page * PAGE, search: applied, sort,
        })
        if ('result' in res && res.result) {
            setHolders(res.result.holders ?? [])
            // The RPC ships the summary with page 1 ONLY — it is identical on
            // every page and is the one part that needs all holders decorated,
            // so paging returns null for it. Keep the copy we already have
            // rather than blanking the tiles on page 2.
            if (res.result.summary) setSummary(res.result.summary)
            setTotal(res.result.total ?? 0)
        } else if ('error' in res) {
            toast({ title: 'Could not load holders', description: res.error, variant: 'destructive' })
        }
        setLoading(false)
    }, [organizerId, badgeId, page, applied, sort, toast])

    useEffect(() => { load() }, [load])

    // Reset paging when the sheet opens on a different badge.
    useEffect(() => { setPage(0); setSearch(''); setApplied(''); setSort('recent') }, [badgeId])

    useEffect(() => {
        const t = setTimeout(() => { setPage(0); setApplied(search.trim()) }, 400)
        return () => clearTimeout(t)
    }, [search])

    // Export and copy pull the WHOLE current selection, not the visible page —
    // copying 25 of 306 silently would be worse than not offering the button.
    async function fetchAll(): Promise<BadgeHolder[]> {
        if (!badgeId) return []
        const res = await getBadgeHolders(organizerId, badgeId, {
            limit: 5000, offset: 0, search: applied, sort,
        })
        return 'result' in res && res.result ? res.result.holders ?? [] : []
    }

    async function copyEmails() {
        setBusy(true)
        try {
            const rows = await fetchAll()
            await navigator.clipboard.writeText(rows.map((h) => h.email).join(', '))
            toast({ title: 'Emails copied', description: `${rows.length} copied to clipboard.` })
        } catch {
            toast({ title: 'Copy failed', description: 'Please try again.', variant: 'destructive' })
        } finally { setBusy(false) }
    }

    async function exportCsv() {
        setBusy(true)
        try {
            const rows = await fetchAll()
            const head = ['Name', 'Email', 'Earned', 'How', 'Has account', 'Segment', 'Events bought', 'Attended', 'Total spent']
            const body = rows.map((h) => [
                h.name || '', h.email, day(h.earned_at),
                h.grant_type === 'auto' ? 'Earned' : 'Hand-granted',
                h.has_account ? 'yes' : 'no',
                h.rfm_segment || '', h.events_purchased, h.events_attended, Number(h.total_spent || 0),
            ].map(csvEscape).join(','))
            download([head.map(csvEscape).join(','), ...body].join('\n'),
                `badge-holders-${badge?.name ?? 'badge'}-${format(new Date(), 'yyyy-MM-dd')}.csv`
                    .replace(/\s+/g, '-').toLowerCase())
            toast({ title: 'Exported', description: `${rows.length} holders downloaded.` })
        } catch {
            toast({ title: 'Export failed', description: 'Please try again.', variant: 'destructive' })
        } finally { setBusy(false) }
    }

    const pages = Math.max(1, Math.ceil(total / PAGE))

    return (
        <Sheet open={!!badge} onOpenChange={(o) => !o && onClose()}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
                <SheetHeader>
                    <SheetTitle>{badge?.name}</SheetTitle>
                    <SheetDescription>
                        Everyone who holds this badge, with what they have spent with you.
                    </SheetDescription>
                </SheetHeader>

                {summary && (
                    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Tile label="Holders" value={String(summary.holders)} />
                        <Tile
                            label="Can see it"
                            value={String(summary.with_account)}
                            hint={summary.holders > 0
                                ? `${Math.round((summary.with_account / summary.holders) * 100)}% have an account`
                                : undefined}
                        />
                        <Tile label="Their spend" value={pesoTile(summary.total_spent)}
                            title={peso(summary.total_spent)} />
                        <Tile label="Avg each" value={pesoTile(summary.avg_spent)}
                            title={peso(summary.avg_spent)} />
                    </div>
                )}

                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                        placeholder="Search name or email…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="sm:max-w-xs"
                    />
                    <Select value={sort} onValueChange={(v) => { setPage(0); setSort(v as any) }}>
                        <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="recent">Newest first</SelectItem>
                            <SelectItem value="spend">Biggest spender</SelectItem>
                            <SelectItem value="name">Name A–Z</SelectItem>
                        </SelectContent>
                    </Select>
                    <div className="flex gap-2 sm:ml-auto">
                        <Button variant="outline" size="sm" onClick={copyEmails} disabled={busy || total === 0} className="gap-1.5">
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />} Copy
                        </Button>
                        <Button variant="outline" size="sm" onClick={exportCsv} disabled={busy || total === 0} className="gap-1.5">
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} CSV
                        </Button>
                    </div>
                </div>

                <div className="mt-4 space-y-2">
                    {loading && holders.length === 0 && (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading…
                        </p>
                    )}
                    {!loading && holders.length === 0 && (
                        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                            {applied ? 'Nobody matches that search.' : 'No holders yet.'}
                        </p>
                    )}
                    {holders.map((h) => (
                        <div key={h.email} className="flex items-center gap-3 rounded-xl border border-border p-3">
                            <div
                                title={h.has_account ? 'Has a HangHut account — can see this badge' : 'No account yet — cannot see this badge'}
                                className="shrink-0"
                            >
                                {h.has_account
                                    ? <Eye className="h-4 w-4 text-primary" />
                                    : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold">{h.name || h.email}</p>
                                <p className="truncate text-xs text-muted-foreground">{h.email}</p>
                            </div>
                            <div className="hidden shrink-0 sm:block"><SegmentChip segment={h.rfm_segment} /></div>
                            <div className="shrink-0 text-right">
                                <p className="text-sm font-semibold tabular-nums">{peso(h.total_spent)}</p>
                                <p className="text-xs text-muted-foreground tabular-nums">
                                    {h.events_purchased} {h.events_purchased === 1 ? 'event' : 'events'}
                                    {h.grant_type !== 'auto' && ' · given'}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>

                {pages > 1 && (
                    <div className="mt-4 flex items-center justify-between">
                        <p className="text-xs text-muted-foreground tabular-nums">
                            {page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} of {total}
                        </p>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" disabled={page === 0 || loading}
                                onClick={() => setPage((p) => Math.max(0, p - 1))}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="sm" disabled={page + 1 >= pages || loading}
                                onClick={() => setPage((p) => p + 1)}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    )
}

/* ─────────────────────────── loyal core ─────────────────────────── */

function LoyalCore({
    organizerId, initial,
}: { organizerId: string; initial: LoyalCoreResult | null }) {
    const { toast } = useToast()
    const [minBadges, setMinBadges] = useState(2)
    const [data, setData] = useState<LoyalCoreResult | null>(initial)
    const [loading, setLoading] = useState(false)
    const [busy, setBusy] = useState(false)
    const [page, setPage] = useState(0)

    const load = useCallback(async (min: number, p: number) => {
        setLoading(true)
        const res = await getBadgeLoyalCore(organizerId, { minBadges: min, limit: CORE_PAGE, offset: p * CORE_PAGE })
        if ('result' in res && res.result) setData(res.result)
        setLoading(false)
    }, [organizerId])

    const people: LoyalFan[] = data?.people ?? []
    const total = data?.total ?? 0
    const pages = Math.max(1, Math.ceil(total / CORE_PAGE))

    async function copyEmails() {
        setBusy(true)
        try {
            const res = await getBadgeLoyalCore(organizerId, { minBadges, limit: 5000, offset: 0 })
            const rows = 'result' in res && res.result ? res.result.people ?? [] : []
            await navigator.clipboard.writeText(rows.map((p) => p.email).join(', '))
            toast({ title: 'Emails copied', description: `${rows.length} of your most loyal fans.` })
        } catch {
            toast({ title: 'Copy failed', description: 'Please try again.', variant: 'destructive' })
        } finally { setBusy(false) }
    }

    async function exportCsv() {
        setBusy(true)
        try {
            const res = await getBadgeLoyalCore(organizerId, { minBadges, limit: 5000, offset: 0 })
            const rows = 'result' in res && res.result ? res.result.people ?? [] : []
            const head = ['Name', 'Email', 'Badges held', 'Badge names', 'Segment', 'Events bought', 'Attended', 'Total spent', 'Has account']
            const body = rows.map((p) => [
                p.name || '', p.email, p.badge_count,
                (p.badges ?? []).map((b) => b.name).join(' | '),
                p.rfm_segment || '', p.events_purchased, p.events_attended,
                Number(p.total_spent || 0), p.has_account ? 'yes' : 'no',
            ].map(csvEscape).join(','))
            download([head.map(csvEscape).join(','), ...body].join('\n'),
                `loyal-fans-${format(new Date(), 'yyyy-MM-dd')}.csv`)
            toast({ title: 'Exported', description: `${rows.length} fans downloaded.` })
        } catch {
            toast({ title: 'Export failed', description: 'Please try again.', variant: 'destructive' })
        } finally { setBusy(false) }
    }

    return (
        <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                        <Sparkles className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold">Your loyal core</h3>
                        <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">
                            People holding more than one of your badges. One badge can be a single
                            purchase; several means they kept coming back.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Label htmlFor="min-badges" className="text-xs text-muted-foreground">Holding</Label>
                    <Select
                        value={String(minBadges)}
                        onValueChange={(v) => { const n = Number(v); setMinBadges(n); setPage(0); load(n, 0) }}
                    >
                        <SelectTrigger id="min-badges" className="w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="2">2+ badges</SelectItem>
                            <SelectItem value="3">3+ badges</SelectItem>
                            <SelectItem value="4">4+ badges</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {data?.summary && total > 0 && (
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Tile label="People" value={String(data.summary.people)} />
                    <Tile label="Their spend" value={pesoTile(data.summary.total_spent)}
                        title={peso(data.summary.total_spent)} />
                    <Tile label="Avg each" value={pesoTile(data.summary.avg_spent)}
                        title={peso(data.summary.avg_spent)} />
                    <Tile label="Most badges held" value={String(data.summary.max_badges)} />
                </div>
            )}

            {total > 0 && (
                <div className="mt-4 flex gap-2">
                    <Button variant="outline" size="sm" onClick={copyEmails} disabled={busy} className="gap-1.5">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />} Copy emails
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportCsv} disabled={busy} className="gap-1.5">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export CSV
                    </Button>
                </div>
            )}

            <div className="mt-4 space-y-2">
                {loading && (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading…
                    </p>
                )}
                {!loading && people.length === 0 && (
                    <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                        Nobody holds {minBadges} or more of your badges yet. This fills up as you add
                        badges that reward different things.
                    </p>
                )}
                {!loading && people.map((p) => (
                    <div key={p.email} className="rounded-xl border border-border p-3">
                        <div className="flex items-center gap-3">
                            <Badge variant="default" className="shrink-0 tabular-nums">
                                {p.badge_count}
                            </Badge>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold">{p.name || p.email}</p>
                                <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                            </div>
                            <div className="hidden shrink-0 sm:block"><SegmentChip segment={p.rfm_segment} /></div>
                            <div className="shrink-0 text-right">
                                <p className="text-sm font-semibold tabular-nums">{peso(p.total_spent)}</p>
                                <p className="text-xs text-muted-foreground tabular-nums">
                                    {p.events_purchased} {p.events_purchased === 1 ? 'event' : 'events'}
                                </p>
                            </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5 pl-9">
                            {(p.badges ?? []).map((b) => (
                                <Badge key={b.id} variant="secondary" className="text-[10px]">{b.name}</Badge>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {pages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground tabular-nums">
                        {page * CORE_PAGE + 1}–{Math.min((page + 1) * CORE_PAGE, total)} of {total}
                    </p>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={page === 0 || loading}
                            onClick={() => { const n = page - 1; setPage(n); load(minBadges, n) }}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" disabled={page + 1 >= pages || loading}
                            onClick={() => { const n = page + 1; setPage(n); load(minBadges, n) }}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </Card>
    )
}

/* ─────────────────────────── top level ─────────────────────────── */

export function BadgeInsights({
    organizerId, analytics, loyalCore,
}: {
    organizerId: string
    analytics: BadgeAnalytics | null
    loyalCore: LoyalCoreResult | null
}) {
    const [open, setOpen] = useState<BadgeStat | null>(null)

    const t = analytics?.totals
    const badges = analytics?.badges ?? []
    if (!t || t.badges === 0) return null

    return (
        <div className="space-y-6">
            <Card className="p-6">
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                        <Award className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold">How your badges are doing</h3>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Awards counted per badge, and how many holders can actually see theirs.
                        </p>
                    </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Tile label="Awards" value={String(t.awards)}
                        hint={`${t.distinct_holders} ${t.distinct_holders === 1 ? 'person' : 'people'}`} />
                    <Tile label="Last 30 days" value={String(t.awards_30d)} />
                    {/* A badge nobody can see is worth nothing, so this is a headline
                        number rather than a detail: badges are keyed on email, and a
                        holder with no HangHut account has nowhere to wear it. */}
                    <Tile label="Visible to holder" value={`${t.pct_visible}%`}
                        hint={`${t.visible} of ${t.awards} awards`} />
                    <Tile label="Badges" value={String(t.badges)}
                        hint={`${t.active} active`} />
                </div>

                {t.pct_visible < 50 && t.awards > 0 && (
                    <p className="mt-4 rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                        Most of these badges were earned by people who checked out as guests, so
                        they have no account to wear them on yet. They attach automatically if that
                        person ever signs up with the same email.
                    </p>
                )}

                <div className="mt-5 space-y-2">
                    {badges.map((b) => (
                        <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="truncate font-semibold">{b.name}</span>
                                    {b.tier && <Badge variant="secondary" className="text-[10px] capitalize">{b.tier}</Badge>}
                                    {!b.is_active && <Badge variant="outline" className="text-[10px]">paused</Badge>}
                                </div>
                                <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                                    {b.holders} {b.holders === 1 ? 'holder' : 'holders'}
                                    {' · '}{b.pct_visible}% can see it
                                    {b.hand_granted > 0 && ` · ${b.hand_granted} given by hand`}
                                    {b.earned_30d > 0 && ` · +${b.earned_30d} this month`}
                                </p>
                            </div>
                            <Curve curve={b.curve} />
                            <Button variant="outline" size="sm" onClick={() => setOpen(b)} className="gap-1.5">
                                <Users className="h-3.5 w-3.5" /> Holders
                            </Button>
                        </div>
                    ))}
                </div>
            </Card>

            <LoyalCore organizerId={organizerId} initial={loyalCore} />
            <HoldersSheet organizerId={organizerId} badge={open} onClose={() => setOpen(null)} />
        </div>
    )
}
