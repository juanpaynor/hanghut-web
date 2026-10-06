'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, MapPin, Globe, RefreshCw, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface EventStatus {
    ok: true
    label: string | null
    event: {
        title: string
        starts_at: string
        ends_at: string | null
        venue: string | null
        is_online: boolean
        status: string
    }
    totals: {
        capacity: number | null
        sold: number
        checked_in: number
        remaining: number
        checked_in_last_15m?: number
    }
    tiers: { name: string; sold: number; checked_in: number; total: number | null }[]
    revenue: { gross: number; currency: string } | null
    generated_at: string
}

const fmt = new Intl.NumberFormat('en-PH')

/**
 * Ratio clamped to 0..1, and 0 when the denominator is unknown — an unknown
 * capacity must read as "no idea", never as a full bar.
 */
function ratio(part: number, whole: number | null | undefined) {
    if (!whole || whole <= 0) return 0
    return Math.max(0, Math.min(1, part / whole))
}

function countdown(ms: number): string {
    const m = Math.round(ms / 60000)
    if (m < 60) return `${m}m`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ${m % 60}m`
    return `${Math.floor(h / 24)}d ${h % 24}h`
}

/**
 * Which number leads. Before doors the night is a sales story and check-ins are
 * all zero; once it starts, nobody at a door cares about sales any more. Showing
 * one fixed hero would make the page useless for half of its life.
 */
type Phase = 'before' | 'live' | 'after'

function Ring({ value, of, tone, size }: {
    value: number; of: number | null; tone: 'accent' | 'good'; size: 'lg' | 'sm'
}) {
    const R = 52
    const C = 2 * Math.PI * R
    const pct = ratio(value, of)
    const box = size === 'lg' ? 'h-[150px] w-[150px]' : 'h-[104px] w-[104px]'
    const num = size === 'lg' ? 'text-[38px]' : 'text-2xl'

    return (
        <div className={cn('relative mx-auto', box)}>
            <svg viewBox="0 0 120 120" className="block h-full w-full" aria-hidden="true">
                <circle cx="60" cy="60" r={R} fill="none" strokeWidth={size === 'lg' ? 8 : 9} className="stroke-muted" />
                <circle
                    cx="60" cy="60" r={R} fill="none" strokeWidth={size === 'lg' ? 8 : 9} strokeLinecap="round"
                    strokeDasharray={`${C * pct} ${C}`}
                    transform="rotate(-90 60 60)"
                    className={cn(
                        'transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none',
                        tone === 'accent' ? 'stroke-primary' : 'stroke-emerald-500',
                    )}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                <span className={cn('font-extrabold leading-none tabular-nums', num)}>{fmt.format(value)}</span>
                {of != null && of > 0 && (
                    <span className="text-[11px] text-muted-foreground tabular-nums">of {fmt.format(of)}</span>
                )}
            </div>
        </div>
    )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="rounded-xl border border-border bg-card px-3 py-3 text-center">
            <p className="text-xl font-bold tabular-nums leading-tight">{value}</p>
            <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
        </div>
    )
}

export function EventStatusView({ status }: { status: EventStatus }) {
    const router = useRouter()
    const { event, totals, tiers, revenue, label } = status
    const [ago, setAgo] = useState('just now')
    const [now, setNow] = useState(() => Date.now())
    const generatedAt = useRef(new Date(status.generated_at).getTime())

    // Re-read generated_at whenever the server hands us a fresher payload,
    // otherwise the counter keeps climbing off the first render and a refreshed
    // page still claims its data is minutes old.
    useEffect(() => {
        generatedAt.current = new Date(status.generated_at).getTime()
        setAgo('just now')
    }, [status.generated_at])

    useEffect(() => {
        const tick = () => {
            setNow(Date.now())
            const s = Math.max(0, Math.round((Date.now() - generatedAt.current) / 1000))
            setAgo(s < 10 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`)
        }
        tick()
        const id = setInterval(tick, 5000)
        return () => clearInterval(id)
    }, [])

    // Refresh on a slow cadence, and ONLY while someone is actually looking. One
    // link goes to a dozen staff who leave it open all night; a phone face-down
    // on the merch table should cost nothing. Backgrounded tabs never poll, and
    // returning to the tab refreshes at once so it is current when looked at.
    useEffect(() => {
        const refreshIfVisible = () => {
            if (document.visibilityState === 'visible') router.refresh()
        }
        const id = setInterval(refreshIfVisible, 60_000)
        document.addEventListener('visibilitychange', refreshIfVisible)
        return () => {
            clearInterval(id)
            document.removeEventListener('visibilitychange', refreshIfVisible)
        }
    }, [router])

    const { phase, startMs } = useMemo(() => {
        const start = new Date(event.starts_at).getTime()
        // No end time is the common case, so assume a 4-hour show rather than
        // leaving such an event stuck on "live" forever.
        const end = event.ends_at ? new Date(event.ends_at).getTime() : start + 4 * 3600_000
        return {
            startMs: start,
            phase: (now < start ? 'before' : now > end ? 'after' : 'live') as Phase,
        }
    }, [event.starts_at, event.ends_at, now])

    const when = new Date(event.starts_at).toLocaleString('en-PH', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
    })
    const doorPct = Math.round(ratio(totals.checked_in, totals.sold) * 100)
    const soldPct = Math.round(ratio(totals.sold, totals.capacity) * 100)
    const recent = totals.checked_in_last_15m ?? 0
    const leadIsDoor = phase !== 'before'

    return (
        <div className="mx-auto min-h-[100dvh] max-w-2xl bg-background px-4 pb-10 pt-5 text-foreground">
            <header className="mb-4">
                <div className="mb-2.5 flex flex-wrap items-center gap-2">
                    {phase === 'live' ? (
                        <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                            <span className="relative flex h-1.5 w-1.5">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75 motion-reduce:hidden" />
                                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            </span>
                            Doors open
                        </span>
                    ) : (
                        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            {phase === 'before' ? `In ${countdown(startMs - now)}` : 'Ended'}
                        </span>
                    )}
                    {label && <span className="text-xs text-muted-foreground">{label}</span>}
                </div>
                <h1 className="text-balance text-2xl font-extrabold leading-tight">{event.title}</h1>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                    {when}
                    {event.is_online ? (
                        <><span aria-hidden>·</span><Globe className="h-3.5 w-3.5 shrink-0" />Online</>
                    ) : event.venue ? (
                        <><span aria-hidden>·</span><MapPin className="h-3.5 w-3.5 shrink-0" />{event.venue}</>
                    ) : null}
                </p>
            </header>

            <section className="rounded-2xl border border-border bg-card px-4 py-6 text-center" aria-label="Headline">
                <Ring
                    value={leadIsDoor ? totals.checked_in : totals.sold}
                    of={leadIsDoor ? totals.sold : totals.capacity}
                    tone={leadIsDoor ? 'good' : 'accent'}
                    size="lg"
                />
                <p className="mt-3 text-base font-bold">{leadIsDoor ? 'Checked in' : 'Tickets sold'}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                    {leadIsDoor
                        ? (totals.sold > 0 ? `${doorPct}% of everyone who bought` : 'No tickets sold')
                        : (totals.capacity ? `${soldPct}% of capacity` : 'No capacity set')}
                </p>
                {leadIsDoor && recent > 0 && (
                    <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <TrendingUp className="h-3.5 w-3.5" />
                        {fmt.format(recent)} in the last 15 min
                    </p>
                )}
            </section>

            <section className="mt-3 grid grid-cols-3 gap-2.5" aria-label="Totals">
                {leadIsDoor ? (
                    <>
                        <Stat label="Sold" value={fmt.format(totals.sold)} />
                        <Stat label="Still out" value={fmt.format(Math.max(0, totals.sold - totals.checked_in))} />
                        <Stat label="Capacity" value={totals.capacity ? fmt.format(totals.capacity) : '—'} />
                    </>
                ) : (
                    <>
                        <Stat label="Left" value={totals.capacity ? fmt.format(totals.remaining) : '—'} />
                        <Stat label="Capacity" value={totals.capacity ? fmt.format(totals.capacity) : '—'} />
                        <Stat label="Checked in" value={fmt.format(totals.checked_in)} />
                    </>
                )}
            </section>

            {revenue && (
                <section className="mt-3 flex items-baseline justify-between rounded-2xl border border-border bg-card px-4 py-4">
                    <span className="text-sm font-semibold text-muted-foreground">Gross sales</span>
                    <span className="text-2xl font-extrabold tabular-nums">
                        &#8369;{fmt.format(Math.round(revenue.gross))}
                    </span>
                </section>
            )}

            {tiers.length > 0 && (
                <section aria-label="By ticket type">
                    <h2 className="mb-2.5 mt-7 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        By ticket type
                    </h2>
                    <ul className="flex list-none flex-col gap-2.5 p-0">
                        {tiers.map((t) => (
                            <li key={t.name} className="rounded-xl border border-border bg-card px-4 py-3.5">
                                <div className="flex items-baseline justify-between gap-3">
                                    <span className="min-w-0 break-words text-[15px] font-semibold">{t.name}</span>
                                    <span className="whitespace-nowrap text-[15px] font-bold tabular-nums">
                                        {fmt.format(leadIsDoor ? t.checked_in : t.sold)}
                                        <span className="font-medium text-muted-foreground">
                                            {' / '}{fmt.format(leadIsDoor ? t.sold : (t.total ?? t.sold))}
                                        </span>
                                    </span>
                                </div>
                                <div className="my-2.5 h-[7px] overflow-hidden rounded-full bg-muted">
                                    <div
                                        className={cn(
                                            'h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none',
                                            leadIsDoor ? 'bg-emerald-500' : 'bg-primary',
                                        )}
                                        style={{
                                            width: `${ratio(
                                                leadIsDoor ? t.checked_in : t.sold,
                                                leadIsDoor ? t.sold : (t.total ?? t.sold),
                                            ) * 100}%`,
                                        }}
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground tabular-nums">
                                    {leadIsDoor
                                        ? `${fmt.format(t.sold)} sold`
                                        : `${fmt.format(t.checked_in)} checked in`}
                                </p>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <footer className="mt-7 flex items-center justify-between text-xs text-muted-foreground">
                <span>Updated {ago}</span>
                <button
                    type="button"
                    onClick={() => router.refresh()}
                    className="flex items-center gap-1.5 rounded-md px-1 py-2 font-semibold text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh
                </button>
            </footer>
        </div>
    )
}
