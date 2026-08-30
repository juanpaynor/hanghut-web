'use client'

import { useState, useTransition, useEffect } from 'react'
import Link from 'next/link'
import {
    Minus, Plus, Banknote, CreditCard, Landmark, Gift, Check, Undo2,
    Loader2, Ticket, Search, DoorOpen, X, Printer, Calculator,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import {
    sellAtDoor, voidDoorSale, getDoorSales, getDoorSummary, findAtDoor, admitAtDoor,
    recordDoorCloseout, getDoorCloseouts,
    type DoorPaymentMethod, type DoorSale, type DoorSaleResult, type DoorSummaryRow,
    type DoorAttendee, type DoorCloseout,
} from '@/lib/box-office/actions'

interface Tier { id: string; name: string; price: number; available: number }

const METHODS: { value: DoorPaymentMethod; label: string; hint: string; icon: typeof Banknote }[] = [
    { value: 'CASH', label: 'Cash', hint: 'In the tin', icon: Banknote },
    { value: 'TERMINAL', label: 'Card', hint: 'Your terminal', icon: CreditCard },
    { value: 'BANK', label: 'Transfer', hint: 'To your bank', icon: Landmark },
    { value: 'COMP', label: 'Comp', hint: 'Guest list', icon: Gift },
]

const peso = (n: number) =>
    `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

/**
 * The door till — a desktop POS, not a phone form.
 *
 * Two rules drive the whole layout:
 *   1. NOTHING SCROLLS. The window is a fixed h-screen grid; only the sales list
 *      and search results have their own overflow. Staff should never have to
 *      hunt for a control with a queue in front of them.
 *   2. The takings are always on screen. The right rail shows what is in the tin
 *      and what has been sold without anyone switching views to check.
 *
 * Below lg it falls back to a single scrolling column, because a phone cannot
 * honour rule 1 honestly and pretending otherwise would just hide controls.
 */
export function DoorTill({
    eventId, eventTitle, basePrice, tiers, ticketsLeft, initialSales, initialSummary,
}: {
    eventId: string
    eventTitle: string
    basePrice: number
    tiers: Tier[]
    ticketsLeft: number
    initialSales: DoorSale[]
    initialSummary: DoorSummaryRow[]
}) {
    const { toast } = useToast()
    const [pending, startTransition] = useTransition()

    const [mode, setMode] = useState<'sell' | 'find'>('sell')
    const [qty, setQty] = useState(1)
    const [tierId, setTierId] = useState<string | null>(tiers[0]?.id ?? null)
    const [method, setMethod] = useState<DoorPaymentMethod>('CASH')
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [admitNow, setAdmitNow] = useState(true)
    const [tendered, setTendered] = useState('')
    const [last, setLast] = useState<(DoorSaleResult & { buyerName: string }) | null>(null)
    const [sales, setSales] = useState(initialSales)
    const [summary, setSummary] = useState(initialSummary)
    const [stock, setStock] = useState(ticketsLeft)

    const [query, setQuery] = useState('')
    const [results, setResults] = useState<DoorAttendee[] | null>(null)
    const [searching, setSearching] = useState(false)

    const selectedTier = tiers.find((t) => t.id === tierId)
    const unit = method === 'COMP' ? 0 : (selectedTier?.price ?? basePrice)
    const total = unit * qty
    // With tiers the event-wide count is the wrong guard: the tier in front of you
    // can be sold out while another still has stock.
    const leftForSale = selectedTier ? Math.min(selectedTier.available, stock) : stock

    const isCash = method === 'CASH' && total > 0
    const tenderedNum = tendered === '' ? null : Number(tendered)
    const tenderValid = tenderedNum !== null && Number.isFinite(tenderedNum) && tenderedNum > 0
    const short = tenderValid && tenderedNum < total
    const change = tenderValid && !short ? tenderedNum - total : null

    // Quick-tender tiles: exact, then the notes someone actually hands over.
    // PH notes are 20/50/100/200/500/1000, so rounding up to those is what a
    // buyer's pocket produces — arbitrary round numbers would not be tapped.
    const quickTenders = Array.from(new Set(
        [total, ...[50, 100, 200, 500, 1000].map((n) => Math.ceil(total / n) * n), 1000, 2000]
            .filter((n) => n >= total)
    )).sort((a, b) => a - b).slice(0, 4)

    // A tendered amount belongs to one specific total. If the operator changes the
    // quantity or tier after typing it, the change figure would silently be wrong.
    useEffect(() => { setTendered('') }, [total, method])

    // The success panel covers the sale column, so it must clear itself — otherwise
    // the next person in the queue is looking at the previous buyer's receipt.
    useEffect(() => {
        if (!last) return
        // A sale with change owed STAYS until dismissed: the figure disappearing
        // while someone is still counting notes out of a drawer is worse than an
        // operator having to tap "Next sale".
        if ((last.change_given ?? 0) > 0) return
        const t = setTimeout(() => setLast(null), 6000)
        return () => clearTimeout(t)
    }, [last])

    const refresh = async () => {
        const [nextSales, nextSummary] = await Promise.all([getDoorSales(eventId), getDoorSummary(eventId)])
        setSales(nextSales)
        setSummary(nextSummary)
    }

    const submit = () => {
        if (!name.trim()) {
            toast({
                title: 'Who is it for?',
                description: 'A name is required — it is how you find them later.',
                variant: 'destructive',
            })
            return
        }
        startTransition(async () => {
            const res = await sellAtDoor({
                eventId, quantity: qty, tierId,
                buyerName: name.trim(),
                buyerEmail: email.trim() || null,
                paymentMethod: method, admitNow,
                cashTendered: isCash && tenderValid && !short ? tenderedNum : null,
            })
            if ('error' in res) {
                toast({ title: 'Sale failed', description: res.error, variant: 'destructive' })
                return
            }
            setLast({ ...res.data, buyerName: name.trim() })
            setStock((s) => Math.max(0, s - res.data.quantity))
            setQty(1); setName(''); setEmail(''); setMethod('CASH'); setTendered('')
            void refresh()
        })
    }

    const undo = (intentId: string) => {
        startTransition(async () => {
            const res = await voidDoorSale(intentId, eventId, 'Voided at the door')
            if ('error' in res) {
                toast({ title: 'Could not void', description: res.error, variant: 'destructive' })
                return
            }
            setStock((s) => s + res.released)
            if (last?.intent_id === intentId) setLast(null)
            toast({ title: 'Sale voided', description: `${res.released} ticket(s) back on sale.` })
            void refresh()
        })
    }

    // Searched on submit rather than per keystroke: venue wifi is unreliable and a
    // request per character is the first thing to fall over when it degrades.
    const runSearch = async (q: string) => {
        if (q.trim().length < 2) { setResults(null); return }
        setSearching(true)
        setResults(await findAtDoor(eventId, q))
        setSearching(false)
    }

    const admit = (t: DoorAttendee) => {
        startTransition(async () => {
            const res = await admitAtDoor(t.ticket_id)
            if (res.ok) {
                toast({ title: `${res.who ?? 'Guest'} is in` })
                setResults((prev) => prev?.map((r) => r.ticket_id === t.ticket_id
                    ? { ...r, checked_in_at: new Date().toISOString(), status: 'used' } : r) ?? null)
                return
            }
            toast({
                title: res.error === 'ALREADY_IN' ? 'Already checked in' : 'Cannot admit',
                description: res.error === 'ALREADY_IN'
                    ? `${res.who ?? 'They'} were let in by ${res.checked_in_by_name ?? 'the team'}.`
                    : res.message,
                variant: res.error === 'ALREADY_IN' ? 'default' : 'destructive',
            })
            if (res.error === 'ALREADY_IN') void runSearch(query)
        })
    }

    const cashHeld = summary.reduce((n, r) => n + r.cash_amount, 0)
    const cardTotal = summary.reduce((n, r) => n + r.terminal_amount, 0)
    const bankTotal = summary.reduce((n, r) => n + r.bank_amount, 0)
    const onlineTotal = summary.reduce((n, r) => n + r.online_amount, 0)
    const compUnits = summary.reduce((n, r) => n + r.comp_units, 0)
    const soldUnits = summary.reduce((n, r) => n + r.units, 0)

    return (
        <div className="lg:h-screen lg:overflow-hidden flex flex-col bg-muted/30">
            {/* ── Top bar ──────────────────────────────────────────────────── */}
            <header className="shrink-0 flex items-center gap-4 border-b border-border bg-card px-5 py-3">
                <Link href="/box-office" className="text-sm text-muted-foreground hover:text-foreground">
                    ← Events
                </Link>
                <div className="min-w-0 flex-1">
                    <h1 className="truncate font-semibold leading-tight">{eventTitle}</h1>
                </div>
                <div className="hidden shrink-0 items-center gap-6 sm:flex">
                    <Stat label="left" value={String(stock)} />
                    <Stat label="sold at door" value={String(soldUnits)} />
                </div>
                {/* Free events only — the kiosk admits by typed email, which is not
                    proof of a ticket, so it is never offered for a paid door. */}
                {basePrice === 0 && !tiers.some((t) => t.price > 0) && (
                    <Link
                        href={`/checkin/${eventId}`}
                        className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
                    >
                        Check-in
                    </Link>
                )}
                <Link
                    href="/scan"
                    className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
                >
                    Scanner
                </Link>
            </header>

            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
                {/* ── Sale column ──────────────────────────────────────────── */}
                <section className="relative flex min-h-0 flex-1 flex-col border-border lg:border-r">
                    <div className="shrink-0 border-b border-border bg-card px-5 py-2">
                        <div className="inline-flex rounded-lg bg-muted p-1">
                            {(['sell', 'find'] as const).map((m) => (
                                <button
                                    key={m}
                                    onClick={() => setMode(m)}
                                    aria-pressed={mode === m}
                                    className={`rounded-md px-5 py-1.5 text-sm font-medium capitalize transition-colors ${
                                        mode === m ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {m === 'find' ? 'Find a buyer' : 'Sell'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {mode === 'sell' ? (
                        <>
                            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
                                {tiers.length > 0 && (
                                    <Field label="Ticket type">
                                        <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                                            {tiers.map((t) => {
                                                const on = tierId === t.id
                                                const out = t.available <= 0
                                                return (
                                                    <button
                                                        key={t.id}
                                                        onClick={() => setTierId(t.id)}
                                                        disabled={out}
                                                        aria-pressed={on}
                                                        className={`rounded-xl border-2 p-3 text-left transition-colors disabled:opacity-40 ${
                                                            on ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-muted-foreground/30'
                                                        }`}
                                                    >
                                                        <span className="block truncate text-sm font-medium">{t.name}</span>
                                                        <span className="block text-lg font-bold tabular-nums">{peso(t.price)}</span>
                                                        <span className="block text-xs text-muted-foreground">
                                                            {out ? 'sold out' : `${t.available} left`}
                                                        </span>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </Field>
                                )}

                                <div className="grid gap-5 sm:grid-cols-2">
                                    <Field label="How many">
                                        <div className="flex items-center gap-3">
                                            <Button variant="outline" size="icon" className="h-14 w-14 shrink-0"
                                                onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1}>
                                                <Minus className="h-6 w-6" />
                                                <span className="sr-only">One fewer</span>
                                            </Button>
                                            <span className="w-16 text-center text-4xl font-bold tabular-nums">{qty}</span>
                                            <Button variant="outline" size="icon" className="h-14 w-14 shrink-0"
                                                onClick={() => setQty((q) => Math.min(20, q + 1))} disabled={qty >= 20}>
                                                <Plus className="h-6 w-6" />
                                                <span className="sr-only">One more</span>
                                            </Button>
                                        </div>
                                    </Field>

                                    <Field label="How they paid">
                                        <div className="grid grid-cols-2 gap-2">
                                            {METHODS.map((m) => {
                                                const Icon = m.icon
                                                const on = method === m.value
                                                return (
                                                    <button
                                                        key={m.value}
                                                        onClick={() => setMethod(m.value)}
                                                        aria-pressed={on}
                                                        className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left transition-colors ${
                                                            on ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-muted-foreground/30'
                                                        }`}
                                                    >
                                                        <Icon className={`h-5 w-5 shrink-0 ${on ? 'text-primary' : 'text-muted-foreground'}`} />
                                                        <span className="min-w-0">
                                                            <span className="block text-sm font-medium leading-tight">{m.label}</span>
                                                            <span className="block truncate text-xs text-muted-foreground">{m.hint}</span>
                                                        </span>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </Field>
                                </div>

                                <div className="grid gap-5 sm:grid-cols-2">
                                    <Field label="Name" hint="required">
                                        <Input value={name} onChange={(e) => setName(e.target.value)}
                                            placeholder="Who is this for?" className="h-14 text-base" autoComplete="off" />
                                    </Field>
                                    {/* Optional by design: a fake address poisons the customer list
                                        permanently, so this is never presented as required. */}
                                    <Field label="Email" hint="optional — sends their ticket">
                                        <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email"
                                            placeholder="Leave blank if they'd rather not"
                                            className="h-14 text-base" autoComplete="off" autoCapitalize="none" />
                                    </Field>
                                </div>

                                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
                                    <span>
                                        <span className="block text-sm font-medium">Going in now</span>
                                        <span className="block text-xs text-muted-foreground">
                                            {admitNow ? 'Checks them in — no need to scan' : 'Ticket issued, not admitted'}
                                        </span>
                                    </span>
                                    <Switch checked={admitNow} onCheckedChange={setAdmitNow} />
                                </label>
                            </div>

                            {/* Pay bar — pinned. Cash tendered and change live HERE rather than
                                in the scrolling area above: change is the number staff reads out
                                while handing notes back, so it must never be below the fold. */}
                            <div className="shrink-0 border-t border-border bg-card px-5 py-4">
                                {isCash && (
                                    <div className="mb-3 flex flex-wrap items-center gap-2">
                                        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                                            Cash in
                                        </span>
                                        {quickTenders.map((n) => (
                                            <button
                                                key={n}
                                                onClick={() => setTendered(String(n))}
                                                aria-pressed={tenderedNum === n}
                                                className={`rounded-lg border-2 px-3.5 py-2 text-sm font-semibold tabular-nums transition-colors ${
                                                    tenderedNum === n
                                                        ? 'border-primary bg-primary/5'
                                                        : 'border-border bg-card hover:border-muted-foreground/30'
                                                }`}
                                            >
                                                {n === total ? 'Exact' : peso(n)}
                                            </button>
                                        ))}
                                        <Input
                                            value={tendered}
                                            onChange={(e) => setTendered(e.target.value.replace(/[^\d.]/g, ''))}
                                            inputMode="decimal"
                                            placeholder="Other"
                                            className="h-10 w-24 text-sm tabular-nums"
                                        />
                                        {tendered && (
                                            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setTendered('')}>
                                                <X className="h-4 w-4" />
                                                <span className="sr-only">Clear cash received</span>
                                            </Button>
                                        )}

                                        {change !== null && (
                                            <span className="ml-auto flex items-baseline gap-3 rounded-lg bg-primary/10 px-4 py-1.5">
                                                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                                                    Change
                                                </span>
                                                <span className="text-3xl font-bold tabular-nums text-primary">{peso(change)}</span>
                                            </span>
                                        )}
                                        {short && (
                                            <span className="ml-auto text-sm font-medium tabular-nums text-destructive">
                                                Short by {peso(total - tenderedNum!)}
                                            </span>
                                        )}
                                    </div>
                                )}
                                {leftForSale < qty && (
                                    <p className="mb-2 text-sm text-destructive">
                                        Only {leftForSale} {selectedTier ? `${selectedTier.name} ` : ''}ticket(s) left.
                                    </p>
                                )}
                                <Button onClick={submit} disabled={pending || leftForSale < qty || short}
                                    className="flex h-20 w-full items-center justify-between px-6 text-left">
                                    <span className="text-base font-medium opacity-80">
                                        {method === 'COMP' ? `Comp ${qty} ticket${qty > 1 ? 's' : ''}` : `Take ${METHODS.find(m => m.value === method)?.label.toLowerCase()}`}
                                    </span>
                                    <span className="text-4xl font-bold tabular-nums">
                                        {pending ? <Loader2 className="h-8 w-8 animate-spin" /> : peso(total)}
                                    </span>
                                </Button>
                            </div>
                        </>
                    ) : (
                        <div className="flex min-h-0 flex-1 flex-col px-5 py-5">
                            <form onSubmit={(e) => { e.preventDefault(); void runSearch(query) }} className="flex shrink-0 gap-2">
                                <div className="relative flex-1">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                                    <Input value={query} onChange={(e) => setQuery(e.target.value)}
                                        placeholder="Name, email or ticket number"
                                        className="h-14 pl-11 pr-10 text-base" autoComplete="off" autoCapitalize="none" />
                                    {query && (
                                        <button type="button" onClick={() => { setQuery(''); setResults(null) }}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-accent">
                                            <X className="h-4 w-4" /><span className="sr-only">Clear</span>
                                        </button>
                                    )}
                                </div>
                                <Button type="submit" className="h-14 px-8" disabled={searching || query.trim().length < 2}>
                                    {searching ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Find'}
                                </Button>
                            </form>
                            <p className="mt-2 shrink-0 text-xs text-muted-foreground">
                                For someone who already bought but can&rsquo;t show the ticket.
                            </p>

                            <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
                                {results !== null && results.length === 0 && !searching && (
                                    <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                                        Nobody matches &ldquo;{query}&rdquo;. Try their email, or the name on the card they paid with.
                                    </p>
                                )}
                                {results && results.length > 0 && (
                                    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                                        {results.map((r) => {
                                            const isIn = !!r.checked_in_at
                                            const dead = ['cancelled', 'refunded'].includes(r.status)
                                            return (
                                                <div key={r.ticket_id} className="flex items-center justify-between gap-4 px-4 py-3">
                                                    <div className="min-w-0">
                                                        <p className="truncate font-medium">{r.attendee_name ?? 'Unnamed'}</p>
                                                        <p className="truncate text-xs text-muted-foreground">
                                                            {r.tier_name ?? 'Ticket'}
                                                            {r.seat_info?.label && ` · ${r.seat_info.label}`}
                                                            {r.ticket_number && ` · ${r.ticket_number}`}
                                                            {r.attendee_email && ` · ${r.attendee_email}`}
                                                        </p>
                                                    </div>
                                                    {dead ? (
                                                        <Badge variant="destructive" className="shrink-0 capitalize">{r.status}</Badge>
                                                    ) : isIn ? (
                                                        <Badge variant="secondary" className="shrink-0">In</Badge>
                                                    ) : (
                                                        <Button size="sm" className="h-11 shrink-0 px-5" onClick={() => admit(r)} disabled={pending}>
                                                            <DoorOpen className="mr-2 h-4 w-4" /> Let in
                                                        </Button>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Success covers the sale column rather than pushing it, so the
                        layout never shifts under someone's hand. */}
                    {last && mode === 'sell' && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-card/97 px-8 backdrop-blur-sm">
                            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15">
                                <Check className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <div className="text-center">
                                <p className="text-3xl font-bold">{last.buyerName}</p>
                                <p className="mt-1 text-lg text-muted-foreground tabular-nums">
                                    {last.quantity} × {peso(last.total / Math.max(last.quantity, 1))} · {peso(last.total)}
                                </p>
                                {last.change_given !== null && last.change_given > 0 && (
                                    <div className="mx-auto mt-4 inline-flex items-baseline gap-3 rounded-xl bg-primary/10 px-6 py-3">
                                        <span className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                                            Change
                                        </span>
                                        <span className="text-5xl font-bold tabular-nums text-primary">
                                            {peso(last.change_given)}
                                        </span>
                                    </div>
                                )}
                                <p className="mt-3 text-base font-medium">
                                    {last.admitted > 0 ? '✓ Let them in' : 'Ticket issued — not admitted'}
                                    {last.email_sent_to && ' · emailed'}
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <Button size="lg" className="h-14 px-10 text-base" onClick={() => setLast(null)}>
                                    Next sale
                                </Button>
                                <Button size="lg" variant="outline" className="h-14" asChild>
                                    <Link href={last.ticket_url} target="_blank">
                                        <Ticket className="mr-2 h-4 w-4" /> Their ticket
                                    </Link>
                                </Button>
                                <Button size="lg" variant="ghost" className="h-14" onClick={() => undo(last.intent_id)} disabled={pending}>
                                    <Undo2 className="mr-2 h-4 w-4" /> Undo
                                </Button>
                                <PrintSoon label="Receipt" className="h-14 px-5" />
                            </div>
                        </div>
                    )}
                </section>

                {/* ── Takings rail — always visible, never a tab ────────────── */}
                <aside className="flex min-h-0 w-full shrink-0 flex-col bg-card lg:w-80 xl:w-96">
                    <div className="shrink-0 border-b border-border px-5 py-4">
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                            In the tin
                        </p>
                        <p className="mt-1 text-4xl font-bold tabular-nums">{peso(cashHeld)}</p>
                        <CloseOut eventId={eventId} expected={cashHeld} />
                        <PrintSoon label="Print close-out" className="mt-3 w-full justify-center" />
                        <div className="mt-3 space-y-1">
                            {cardTotal > 0 && <Row label="Card terminal" value={peso(cardTotal)} />}
                            {bankTotal > 0 && <Row label="Bank transfer" value={peso(bankTotal)} />}
                            {compUnits > 0 && <Row label="Comps" value={String(compUnits)} />}
                            {/* Money that reached Xendit is NOT in the envelope. */}
                            {onlineTotal > 0 && <Row label="Paid to HangHut" value={peso(onlineTotal)} />}
                            <Row label="Tickets sold" value={String(soldUnits)} />
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {sales.length === 0 && (
                            <p className="px-5 py-6 text-sm text-muted-foreground">Nothing sold at the door yet.</p>
                        )}
                        <div className="divide-y divide-border">
                            {sales.map((s) => {
                                const voided = s.status === 'cancelled'
                                return (
                                    <div key={s.intent_id} className="group flex items-center justify-between gap-3 px-5 py-2.5">
                                        <div className="min-w-0">
                                            <p className={`truncate text-sm font-medium ${voided ? 'text-muted-foreground line-through' : ''}`}>
                                                {s.buyer_name ?? 'Walk-in'}
                                            </p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {s.quantity} · {s.payment_method}{s.admitted && !voided && ' · in'}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1">
                                            <span className={`text-sm tabular-nums ${voided ? 'text-muted-foreground line-through' : 'font-medium'}`}>
                                                {peso(s.total)}
                                            </span>
                                            {!voided && (
                                                <Button size="icon" variant="ghost"
                                                    className="h-8 w-8 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                                                    onClick={() => undo(s.intent_id)} disabled={pending}>
                                                    <Undo2 className="h-4 w-4" />
                                                    <span className="sr-only">Void this sale</span>
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    )
}

/**
 * Printing is planned, not built. Rendered as a visibly disabled control with a
 * "Soon" pill rather than a live button, so nobody at a door taps it during a
 * queue and thinks the till has failed. `disabled` also keeps it out of the tab
 * order, and the title gives a hover explanation on desktop.
 */
function PrintSoon({ label, className = '' }: { label: string; className?: string }) {
    return (
        <span
            title="Printing is coming soon — not available yet"
            className={`inline-flex cursor-not-allowed select-none items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground/70 ${className}`}
            aria-disabled="true"
        >
            <Printer className="h-4 w-4" />
            {label}
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Soon
            </span>
        </span>
    )
}

/**
 * Counting the tin at close.
 *
 * The rail above says what the system RECORDED. This is the other half: what was
 * actually in the drawer. Previously the two were compared in someone's head and
 * a shortfall left no trace.
 *
 * Only the counted figure is sent — the server recomputes what was expected. The
 * variance is deliberately shown plainly and without alarm styling for a match:
 * being ₱20 short at a door is ordinary, and a UI that treats it as an incident
 * trains people to stop reporting it.
 */
function CloseOut({ eventId, expected }: { eventId: string; expected: number }) {
    const { toast } = useToast()
    const [open, setOpen] = useState(false)
    const [counted, setCounted] = useState('')
    const [saved, setSaved] = useState<DoorCloseout | null>(null)
    const [pending, startTransition] = useTransition()

    useEffect(() => {
        void getDoorCloseouts(eventId).then((rows) => setSaved(rows[0] ?? null))
    }, [eventId])

    const amount = Number(counted)
    const canSubmit = counted.trim() !== '' && Number.isFinite(amount) && amount >= 0

    const submit = () => {
        if (!canSubmit) return
        startTransition(async () => {
            const res = await recordDoorCloseout(eventId, amount)
            if (!res.ok) {
                toast({ title: 'Could not save the count', description: res.error, variant: 'destructive' })
                return
            }
            const diff = res.variance
            toast({
                title: diff === 0 ? 'Till balanced' : diff > 0 ? `Over by ${peso(diff)}` : `Short by ${peso(Math.abs(diff))}`,
                description: `Counted ${peso(res.counted)} against ${peso(res.expected)} recorded.`,
            })
            setOpen(false)
            setCounted('')
            void getDoorCloseouts(eventId).then((rows) => setSaved(rows[0] ?? null))
        })
    }

    if (!open) {
        return (
            <div className="mt-3">
                <Button variant="outline" className="w-full justify-center" onClick={() => setOpen(true)}>
                    <Calculator className="mr-2 h-4 w-4" />
                    {saved ? 'Re-count the tin' : 'Count the tin'}
                </Button>
                {saved && (
                    <p className="mt-2 text-xs text-muted-foreground">
                        Counted {peso(saved.counted_cash)} —{' '}
                        {saved.variance === 0
                            ? 'balanced'
                            : saved.variance > 0
                                ? `over by ${peso(saved.variance)}`
                                : `short by ${peso(Math.abs(saved.variance))}`}
                        {' · '}{saved.counted_by_name}
                    </p>
                )}
            </div>
        )
    }

    return (
        <div className="mt-3 rounded-lg border border-border p-3">
            <label htmlFor="counted-cash" className="text-xs font-medium text-muted-foreground">
                Cash actually in the tin
            </label>
            <Input
                id="counted-cash"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                autoFocus
                value={counted}
                placeholder={String(expected)}
                onChange={(e) => setCounted(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                className="mt-1 text-lg tabular-nums"
            />
            {canSubmit && amount !== expected && (
                <p className="mt-2 text-xs text-muted-foreground">
                    {amount > expected
                        ? `${peso(amount - expected)} more than recorded`
                        : `${peso(expected - amount)} less than recorded`}
                </p>
            )}
            <div className="mt-3 flex gap-2">
                <Button className="flex-1" onClick={submit} disabled={!canSubmit || pending}>
                    {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                    Save count
                </Button>
                <Button variant="ghost" onClick={() => { setOpen(false); setCounted('') }} disabled={pending}>
                    Cancel
                </Button>
            </div>
        </div>
    )
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="text-right">
            <p className="text-xl font-bold leading-none tabular-nums">{value}</p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        </div>
    )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {label}{hint && <span className="ml-2 font-normal normal-case tracking-normal opacity-70">{hint}</span>}
            </p>
            {children}
        </div>
    )
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="tabular-nums">{value}</span>
        </div>
    )
}
