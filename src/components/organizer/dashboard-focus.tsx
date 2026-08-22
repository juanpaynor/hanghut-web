import Link from 'next/link'
import Image from 'next/image'
import {
    CalendarDays, MapPin, ArrowUpRight, ArrowDownRight, Store, ScanLine,
    AlertTriangle, Info, ExternalLink, Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DashboardFocus } from '@/lib/organizer/dashboard-actions'

const peso = (n: number) =>
    `₱${Math.round(n).toLocaleString('en-PH')}`

function whenLabel(iso: string, daysOut: number) {
    const d = new Date(iso)
    const time = d.toLocaleString('en-PH', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
    })
    const rel = daysOut <= 0 ? 'Today' : daysOut === 1 ? 'Tomorrow' : `in ${daysOut} days`
    return { time, rel }
}

/**
 * The top of the organizer dashboard.
 *
 * This replaces a decorative gradient banner that occupied the most valuable
 * space on the page and said only "Welcome back". For a live-events business the
 * first question is always the same — what is the next show and how is it doing —
 * so that is what sits here, with the actions needed on the night attached to it.
 */
export function DashboardFocusPanel({ focus, businessName }: { focus: DashboardFocus; businessName: string }) {
    const { nextEvent: e, momentum, counts, attention } = focus
    const delta = momentum.prev7 > 0
        ? Math.round(((momentum.last7 - momentum.prev7) / momentum.prev7) * 100)
        : null

    return (
        <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
                {/* ── Next show ─────────────────────────────────────────────── */}
                <div className="lg:col-span-2">
                    {e ? (
                        <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card">
                            <div className="flex flex-1 gap-4 p-5">
                                {e.cover ? (
                                    <div className="relative hidden h-28 w-28 shrink-0 overflow-hidden rounded-xl sm:block">
                                        <Image src={e.cover} alt="" fill sizes="112px" className="object-cover" />
                                    </div>
                                ) : (
                                    <div className="hidden h-28 w-28 shrink-0 items-center justify-center rounded-xl bg-muted sm:flex">
                                        <CalendarDays className="h-8 w-8 text-muted-foreground/40" />
                                    </div>
                                )}

                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                                            Next up
                                        </span>
                                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                                            {whenLabel(e.startsAt, e.daysOut).rel}
                                        </span>
                                    </div>
                                    <h2 className="mt-1.5 truncate text-xl font-bold tracking-tight">
                                        <Link href={`/organizer/events/${e.id}`} className="hover:underline">{e.title}</Link>
                                    </h2>
                                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                                        <span className="inline-flex items-center gap-1.5">
                                            <CalendarDays className="h-3.5 w-3.5" />{whenLabel(e.startsAt, e.daysOut).time}
                                        </span>
                                        {e.venue && (
                                            <span className="inline-flex items-center gap-1.5">
                                                <MapPin className="h-3.5 w-3.5" />{e.venue}
                                            </span>
                                        )}
                                    </p>

                                    {e.isExternal ? (
                                        <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs text-muted-foreground">
                                            <ExternalLink className="h-3.5 w-3.5" />
                                            Tickets are sold on another site — no sales data here
                                        </p>
                                    ) : (
                                        <div className="mt-3">
                                            <div className="flex items-baseline justify-between text-sm">
                                                <span className="font-medium tabular-nums">
                                                    {e.sold}
                                                    {e.capacity > 0 && <span className="text-muted-foreground"> / {e.capacity} sold</span>}
                                                </span>
                                                <span className="font-semibold tabular-nums">{peso(e.revenue)}</span>
                                            </div>
                                            {e.capacity > 0 && (
                                                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                                                    <div
                                                        className="h-full rounded-full bg-primary transition-all"
                                                        style={{ width: `${Math.min(100, Math.round((e.sold / e.capacity) * 100))}%` }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* The night-of actions, on the thing they apply to. */}
                            {!e.isExternal && (
                                <div className="flex flex-wrap gap-2 border-t border-border bg-muted/30 px-5 py-3">
                                    <Button asChild size="sm" variant="outline">
                                        <a href={`/box-office/${e.id}`} target="_blank" rel="noopener noreferrer">
                                            <Store className="mr-1.5 h-4 w-4" /> Box office
                                        </a>
                                    </Button>
                                    <Button asChild size="sm" variant="outline">
                                        <a href="/scan" target="_blank" rel="noopener noreferrer">
                                            <ScanLine className="mr-1.5 h-4 w-4" /> Scanner
                                        </a>
                                    </Button>
                                    <Button asChild size="sm" variant="ghost">
                                        <Link href={`/organizer/events/${e.id}`}>Manage</Link>
                                    </Button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-10 text-center">
                            <CalendarDays className="h-9 w-9 text-muted-foreground/30" />
                            <p className="mt-3 font-semibold">Nothing coming up</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {businessName} has no upcoming events on sale.
                            </p>
                            <Button asChild className="mt-4">
                                <Link href="/organizer/events/create"><Plus className="mr-1.5 h-4 w-4" /> Create an event</Link>
                            </Button>
                        </div>
                    )}
                </div>

                {/* ── Momentum: recent, not all-time ────────────────────────── */}
                <div className="rounded-2xl border border-border bg-card p-5">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Today</p>
                    <p className="mt-1 text-3xl font-bold tabular-nums">{peso(momentum.today)}</p>

                    <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Last 7 days</span>
                            <span className="flex items-center gap-1.5 font-semibold tabular-nums">
                                {peso(momentum.last7)}
                                {delta !== null && delta !== 0 && (
                                    <span className={`inline-flex items-center text-xs font-medium ${
                                        delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                                    }`}>
                                        {delta > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                        {Math.abs(delta)}%
                                    </span>
                                )}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Orders this week</span>
                            <span className="font-semibold tabular-nums">{momentum.tickets7}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">On sale here</span>
                            <span className="font-semibold tabular-nums">{counts.upcoming}</span>
                        </div>
                        {/* Named honestly: these cannot sell a ticket on HangHut, and
                            lumping them into an "active events" count is what made the
                            old headline meaningless. */}
                        {counts.external > 0 && (
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Listed, sold elsewhere</span>
                                <span className="font-semibold tabular-nums">{counts.external}</span>
                            </div>
                        )}
                        {counts.pastStillActive > 0 && (
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Past, still marked active</span>
                                <Link href="/organizer/events" className="font-semibold tabular-nums text-primary hover:underline">
                                    {counts.pastStillActive}
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Needs attention — only when there is something to do ──────── */}
            {attention.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-border bg-card">
                    <p className="border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Needs attention
                    </p>
                    <div className="divide-y divide-border">
                        {attention.map((a) => (
                            <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                                {a.tone === 'urgent' ? (
                                    <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                                ) : a.tone === 'warn' ? (
                                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                                ) : (
                                    <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{a.title}</p>
                                    <p className="truncate text-xs text-muted-foreground">{a.detail}</p>
                                </div>
                                <Button asChild size="sm" variant="ghost" className="shrink-0">
                                    <Link href={a.href}>{a.action}</Link>
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
