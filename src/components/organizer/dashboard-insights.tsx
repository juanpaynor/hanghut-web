'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { ArrowDownRight, ArrowUpRight, Clock, Minus, Receipt } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * The lower dashboard: the chart, the feed and the two panels under them.
 *
 * What was here asked questions an organizer cannot act on — a tier pie chart
 * that merged every event's "General Admission" into one slice, and a live
 * inventory list that ran to 46 rows against a forty-million-seat capacity
 * because external redirect listings were counted. The chart itself showed a
 * bare 30-day line with nothing to compare it to, so it could not answer the
 * only question anyone opens it for: is this better or worse than usual.
 *
 * Replaced with four things that each answer something:
 *   Sales      — this period against the one before it, same length
 *   Activity   — who just bought, so the page feels alive
 *   Selling now— the shows with time running out, soonest first
 *   Lead time  — when buyers actually commit, i.e. when to promote
 */

const PERIODS = [
    { days: 7, label: '7 days' },
    { days: 30, label: '30 days' },
    { days: 90, label: '90 days' },
] as const

type TrendPoint = { date: string; label: string; revenue: number; tickets: number }

const peso = (n: number) =>
    `₱${Math.round(n).toLocaleString()}`

/** Compact axis labels: ₱48,000 becomes ₱48k. A five-digit tick repeated down
 *  the side is most of what makes a small chart feel busy. */
const compact = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}m`
        : n >= 1_000 ? `${Math.round(n / 1_000)}k`
            : `${n}`

function SoftTooltip({ active, payload, label, mode }: {
    active?: boolean
    payload?: { value: number; dataKey: string }[]
    label?: string
    mode: 'revenue' | 'tickets'
}) {
    if (!active || !payload?.length) return null
    const current = payload.find(p => p.dataKey === 'current')?.value ?? 0
    const previous = payload.find(p => p.dataKey === 'previous')?.value
    return (
        <div className="rounded-xl border bg-background/95 backdrop-blur px-3 py-2 shadow-lg">
            <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
            <p className="text-sm font-semibold tabular-nums">
                {mode === 'revenue' ? peso(current) : `${current} ticket${current === 1 ? '' : 's'}`}
            </p>
            {previous !== undefined && (
                <p className="text-[11px] text-muted-foreground tabular-nums">
                    {mode === 'revenue' ? peso(previous) : previous} previous period
                </p>
            )}
        </div>
    )
}

function Delta({ value }: { value: number | null }) {
    if (value === null) {
        return <span className="text-xs text-muted-foreground">no earlier period to compare</span>
    }
    const flat = Math.abs(value) < 1
    const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight
    return (
        <span className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
            flat ? 'bg-muted text-muted-foreground'
                : value > 0 ? 'bg-emerald-500/10 text-emerald-600'
                    : 'bg-rose-500/10 text-rose-600',
        )}>
            <Icon className="h-3 w-3" />
            {flat ? 'flat' : `${value > 0 ? '+' : ''}${Math.round(value)}%`}
            <span className="font-normal text-muted-foreground">vs previous</span>
        </span>
    )
}

export function SalesTrendCard({ trend }: { trend: TrendPoint[] }) {
    const [days, setDays] = useState<number>(30)
    const [mode, setMode] = useState<'revenue' | 'tickets'>('revenue')

    const { series, total, previousTotal, delta } = useMemo(() => {
        const cur = trend.slice(-days)
        const prev = trend.slice(-days * 2, -days)
        const sum = (rows: TrendPoint[]) => rows.reduce((a, r) => a + r[mode], 0)
        const total = sum(cur)
        const previousTotal = sum(prev)
        // The previous window is drawn UNDER the current one at the same index,
        // so the two periods line up day-for-day rather than by calendar date.
        const series = cur.map((row, i) => ({
            label: row.label,
            current: row[mode],
            previous: prev[i]?.[mode] ?? 0,
        }))
        // No baseline means no percentage. A jump from zero is not "+infinity%"
        // and not "+100%" either — the honest answer is to show nothing.
        const delta = previousTotal === 0
            ? null
            : ((total - previousTotal) / previousTotal) * 100
        return { series, total, previousTotal, delta }
    }, [trend, days, mode])

    const hasAny = total > 0 || previousTotal > 0

    return (
        <Card className="rounded-2xl border-border/70">
            <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <CardTitle className="text-base font-semibold">Sales</CardTitle>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="font-headline text-2xl font-bold tracking-tight tabular-nums">
                                {mode === 'revenue' ? peso(total) : total.toLocaleString()}
                            </span>
                            <Delta value={delta} />
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <Segmented
                            options={[{ v: 'revenue', l: 'Revenue' }, { v: 'tickets', l: 'Tickets' }]}
                            value={mode}
                            onChange={(v) => setMode(v as 'revenue' | 'tickets')}
                        />
                        <Segmented
                            options={PERIODS.map(p => ({ v: String(p.days), l: p.label }))}
                            value={String(days)}
                            onChange={(v) => setDays(Number(v))}
                        />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-2">
                {hasAny ? (
                    <div className="h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="hhSalesFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.22} />
                                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                {/* Horizontal only, and faint — a full grid is most of
                                    what made the old chart feel like a spreadsheet. */}
                                <CartesianGrid
                                    vertical={false}
                                    stroke="currentColor"
                                    className="text-border"
                                    strokeOpacity={0.5}
                                    strokeDasharray="0"
                                />
                                <XAxis
                                    dataKey="label"
                                    tickLine={false}
                                    axisLine={false}
                                    minTickGap={40}
                                    tick={{ fontSize: 11 }}
                                    stroke="currentColor"
                                    className="text-muted-foreground"
                                />
                                <YAxis
                                    width={48}
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fontSize: 11 }}
                                    stroke="currentColor"
                                    className="text-muted-foreground"
                                    tickFormatter={(v: number) => (mode === 'revenue' ? `₱${compact(v)}` : compact(v))}
                                />
                                <Tooltip
                                    cursor={{ stroke: 'hsl(var(--primary))', strokeOpacity: 0.25, strokeWidth: 1 }}
                                    content={<SoftTooltip mode={mode} />}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="previous"
                                    stroke="currentColor"
                                    className="text-muted-foreground/50"
                                    strokeWidth={1.5}
                                    strokeDasharray="4 4"
                                    fill="none"
                                    dot={false}
                                    activeDot={false}
                                    isAnimationActive={false}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="current"
                                    stroke="hsl(var(--primary))"
                                    strokeWidth={2}
                                    strokeLinecap="round"
                                    fill="url(#hhSalesFill)"
                                    dot={false}
                                    activeDot={{ r: 4, strokeWidth: 2, stroke: 'hsl(var(--background))' }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <Empty
                        icon={Receipt}
                        title="No sales in this window"
                        body="Once tickets start selling, this fills in and compares itself to the period before."
                    />
                )}
            </CardContent>
        </Card>
    )
}

export function RecentActivityCard({ activity }: { activity: any[] }) {
    return (
        <Card className="rounded-2xl border-border/70">
            <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Latest sales</CardTitle>
                <CardDescription>The last {activity.length || 10} orders</CardDescription>
            </CardHeader>
            <CardContent>
                {activity.length === 0 ? (
                    <Empty icon={Receipt} title="Nothing yet" body="New orders land here as they happen." />
                ) : (
                    <ul className="-mx-2 divide-y divide-border/60">
                        {activity.map(sale => {
                            const name = sale.purchase_intents?.guest_name || 'Guest'
                            const qty = sale.purchase_intents?.quantity
                            const tier = sale.purchase_intents?.tier?.name
                            return (
                                <li key={sale.id} className="flex items-center gap-3 px-2 py-2.5">
                                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                                        {name.slice(0, 2).toUpperCase()}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium leading-tight">{name}</p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {sale.events?.title || 'Event'}
                                            {tier ? ` · ${tier}` : ''}
                                            {qty ? ` ×${qty}` : ''}
                                        </p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <p className="text-sm font-semibold tabular-nums text-emerald-600">
                                            {peso(sale.gross_amount || 0)}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground">
                                            {formatDistanceToNow(new Date(sale.created_at), { addSuffix: true })}
                                        </p>
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </CardContent>
        </Card>
    )
}

export function SellingNowCard({ events }: {
    events: { id: string; title: string; startDatetime: string; sold: number; capacity: number; revenue: number }[]
}) {
    return (
        <Card className="rounded-2xl border-border/70">
            <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Selling now</CardTitle>
                <CardDescription>Soonest first — the ones with time running out</CardDescription>
            </CardHeader>
            <CardContent>
                {events.length === 0 ? (
                    <Empty
                        icon={Clock}
                        title="Nothing on sale here"
                        body="Events that sell through HangHut show their progress here. Listings that redirect elsewhere are left out."
                    />
                ) : (
                    <ul className="space-y-4">
                        {events.map(e => {
                            const pct = e.capacity > 0 ? Math.min(100, Math.round((e.sold / e.capacity) * 100)) : 0
                            const soldOut = e.capacity > 0 && e.sold >= e.capacity
                            return (
                                <li key={e.id}>
                                    <Link href={`/organizer/events/${e.id}`} className="group block">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <p className="truncate text-sm font-medium group-hover:underline">{e.title}</p>
                                            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                                {formatDistanceToNow(new Date(e.startDatetime), { addSuffix: true })}
                                            </span>
                                        </div>
                                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                            <div
                                                className={cn('h-full rounded-full transition-all', soldOut ? 'bg-emerald-500' : 'bg-primary')}
                                                style={{ width: `${Math.max(pct, e.sold > 0 ? 2 : 0)}%` }}
                                            />
                                        </div>
                                        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tabular-nums">
                                            <span>{e.sold.toLocaleString()} of {e.capacity.toLocaleString()} · {pct}%</span>
                                            <span>{peso(e.revenue)}</span>
                                        </div>
                                    </Link>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </CardContent>
        </Card>
    )
}

export function LeadTimeCard({ leadTime, total }: {
    leadTime: { label: string; tickets: number; revenue: number; share: number }[]
    total: number
}) {
    const peak = leadTime.reduce((a, b) => (b.share > a.share ? b : a), leadTime[0])
    const lastWeek = leadTime
        .filter(b => ['3–7 days', '1–2 days', 'Same day'].includes(b.label))
        .reduce((a, b) => a + b.share, 0)

    return (
        <Card className="rounded-2xl border-border/70">
            <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">When your tickets sell</CardTitle>
                <CardDescription>
                    {total > 0
                        ? `${Math.round(lastWeek * 100)}% of sales land in the final week`
                        : 'How far ahead of the event people buy'}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {total === 0 ? (
                    <Empty
                        icon={Clock}
                        title="Not enough sales yet"
                        body="After a few shows this tells you when to spend on promotion."
                    />
                ) : (
                    <>
                        <ul className="space-y-2.5">
                            {leadTime.map(b => (
                                <li key={b.label} className="flex items-center gap-3">
                                    <span className="w-20 shrink-0 text-xs text-muted-foreground">{b.label}</span>
                                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                        <div
                                            className={cn(
                                                'h-full rounded-full',
                                                b.label === peak?.label ? 'bg-primary' : 'bg-primary/35',
                                            )}
                                            style={{ width: `${Math.max(b.share * 100, b.tickets > 0 ? 2 : 0)}%` }}
                                        />
                                    </div>
                                    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                                        {Math.round(b.share * 100)}%
                                    </span>
                                </li>
                            ))}
                        </ul>
                        {peak && peak.share > 0 && (
                            <p className="mt-4 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                                Most of your buyers commit <b className="text-foreground">{peak.label.toLowerCase()}</b> out.
                                Push hardest just before that window, not after it.
                            </p>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    )
}

/* ── small shared bits ──────────────────────────────────────────────────── */

function Segmented({ options, value, onChange }: {
    options: { v: string; l: string }[]
    value: string
    onChange: (v: string) => void
}) {
    return (
        <div className="inline-flex rounded-lg bg-muted/60 p-0.5">
            {options.map(o => (
                <button
                    key={o.v}
                    type="button"
                    onClick={() => onChange(o.v)}
                    aria-pressed={value === o.v}
                    className={cn(
                        'rounded-[6px] px-2.5 py-1 text-xs font-medium transition-colors',
                        value === o.v
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                    )}
                >
                    {o.l}
                </button>
            ))}
        </div>
    )
}

function Empty({ icon: Icon, title, body }: {
    icon: React.ComponentType<{ className?: string }>
    title: string
    body: string
}) {
    return (
        <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground">
                <Icon className="h-4 w-4" />
            </span>
            <p className="mt-1 text-sm font-medium">{title}</p>
            <p className="max-w-[26ch] text-xs text-muted-foreground">{body}</p>
        </div>
    )
}
