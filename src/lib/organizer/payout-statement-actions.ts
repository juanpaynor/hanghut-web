'use server'

import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getActingPartnerId } from '@/lib/auth/cached'
import { computeFees, sumFees, type FeeRow, type FeeTotals } from '@/lib/finance/fee-model'

/**
 * The data behind the payout statement and the payout advice.
 *
 * Both documents are built in the browser (jsPDF already ships for the attendee
 * export; streaming a generated binary back through the RSC payload would mean
 * base64 for no gain — same reasoning as getEventResponsesExport). Everything
 * that decides a NUMBER happens here, so the PDF, a future CSV and the on-screen
 * summary cannot disagree with each other.
 *
 * ── Why a statement is a PERIOD, not a payout ─────────────────────────
 *
 * The obvious design is "itemise the sales in this payout". It cannot be built
 * honestly. A payout is a withdrawal against a running balance, not a batch:
 * the organizer asks for an amount, and that balance spans three ledgers plus
 * refunds. On prod every completed payout disagrees with the sum of its linked
 * transactions — by −₱725, +₱1,619, −₱400 on the ₱1.1M one, and one ₱45 payout
 * has no linked rows at all. Printing those rows under that total would produce
 * a document that visibly does not add up.
 *
 * So there are two documents:
 *   · the STATEMENT  — everything that happened in a date range. It foots.
 *   · the ADVICE     — one disbursement: amount, date, destination, reference.
 *                      No itemisation, because there is none to give.
 *
 * ── What is deliberately absent ───────────────────────────────────────
 *
 * No opening/closing balance. A balance at a past date needs "what was still
 * unsettled on that date", and settlement state is only known as of now —
 * getSettlementInfo cannot answer it retroactively. A movement statement is
 * honest; a balance statement would be a guess with a decimal point on it.
 */

const PAGE = 1000
const CAP = 20000

/**
 * How many individual transactions the statement carries as line items.
 *
 * The ledger is the point of a statement, so this is generous — but it is not
 * unbounded: every row crosses the RSC payload and then becomes a PDF table
 * row, and a 20,000-line PDF helps nobody. Past this the summary still foots
 * and the document says to use the CSV for the detail.
 */
const DETAIL_LIMIT = 3000

type IntentJoin = {
    discount_amount?: number | string | null
    metadata?: Record<string, unknown> | null
    payment_method?: string | null
}

type TicketRow = FeeRow & {
    id: string
    status: string
    created_at: string
    event_id: string | null
    event: { title: string } | { title: string }[] | null
    purchase_intent: IntentJoin | IntentJoin[] | null
}

/** One transaction, as it appears on the statement's ledger. */
export type StatementRow = {
    id: string
    date: string
    event: string
    method: string
    /** List price less any discount — the figure the fee is taken from. */
    revenue: number
    fees: number
    net: number
    status: string
    /** True when this row does not fit the fee model, so the ledger can mark it. */
    odd: boolean
}

export type StatementEventLine = {
    eventId: string
    title: string
    count: number
    revenue: number
    fees: number
    net: number
}

export type StatementPayoutLine = {
    id: string
    amount: number
    status: string
    requestedAt: string | null
    completedAt: string | null
    bankName: string | null
    maskedAccount: string | null
    reference: string | null
}

/**
 * Set when the statement covers ONE event instead of the whole account.
 *
 * Earnings are event-scoped -- every transactions row carries an event_id --
 * so an event statement is a sound document. Payouts are not: a payout is a
 * withdrawal against a running balance, and on prod only 1 of 20 has an
 * event_id at all. So a scoped bundle reports earnings and reports NO payouts,
 * rather than inventing an attribution the ledger does not have.
 */
export type StatementScope = { eventId: string; eventTitle: string }

export type StatementBundle = {
    partnerName: string
    /** null for the whole account; an event when the statement is scoped. */
    scope: StatementScope | null
    period: { from: string; to: string }
    generatedAt: string
    tickets: FeeTotals
    experiences: FeeTotals
    merch: FeeTotals
    combined: FeeTotals
    /** HangHut fees the BUYERS covered rather than the organizer. Not a cost to
     *  the organizer — shown so the fee line reads as small for a reason. */
    buyerPaidFees: number
    refunds: { count: number; amount: number }
    payouts: StatementPayoutLine[]
    paidOutInPeriod: number
    byEvent: StatementEventLine[]
    /** Every transaction in the period, newest first. Empty when the period
     *  exceeds DETAIL_LIMIT — `detailOmitted` says so. */
    rows: StatementRow[]
    detailOmitted: boolean
    /** Door takings. HangHut never held this money and charges nothing on it,
     *  so it sits outside every total above and is reported separately. */
    doorCollected: number
    /** Rows the fee model could not explain. A statement must say so rather
     *  than absorb them silently. */
    unreconciled: number
    truncated: boolean
}

function flat<T>(v: T | T[] | null | undefined): T | undefined {
    return Array.isArray(v) ? v[0] : (v ?? undefined)
}

function money(v: unknown): number {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}

/** Never put a full account number in a document the organizer will email on. */
function maskAccount(acct: string | null): string | null {
    if (!acct) return null
    const s = String(acct)
    return s.length <= 4 ? `••${s}` : `••••${s.slice(-4)}`
}

/** Inclusive of the whole `to` day, in Manila. A statement cut at midnight UTC
 *  drops the evening's sales — and every show here starts at 8pm. */
function dayEnd(to: string): string {
    return `${to}T23:59:59.999+08:00`
}
function dayStart(from: string): string {
    return `${from}T00:00:00.000+08:00`
}

async function pagedTickets(
    supabase: Awaited<ReturnType<typeof createClient>>,
    partnerId: string,
    from: string,
    to: string,
    eventId: string | null = null,
): Promise<{ rows: TicketRow[]; truncated: boolean }> {
    const rows: TicketRow[] = []
    for (let offset = 0; offset < CAP; offset += PAGE) {
        let q = supabase
            .from('transactions')
            .select(`
                id, status,
                gross_amount, platform_fee, fixed_fee, payment_processing_fee, vat,
                organizer_payout, created_at, event_id,
                event:events ( title ),
                purchase_intent:purchase_intents ( discount_amount, metadata, payment_method )
            `)
            .eq('partner_id', partnerId)
            .in('status', ['completed', 'refunded'])
            .gte('created_at', dayStart(from))
            .lte('created_at', dayEnd(to))
        if (eventId) q = q.eq('event_id', eventId)

        const { data, error } = await q
            .order('created_at', { ascending: true })
            .range(offset, offset + PAGE - 1)

        if (error) throw new Error(error.message)
        const chunk = (data ?? []) as unknown as TicketRow[]
        rows.push(...chunk)
        if (chunk.length < PAGE) return { rows, truncated: false }
    }
    return { rows, truncated: true }
}

export async function getPayoutStatement(
    opts: { from: string; to: string; eventId?: string | null },
): Promise<{ bundle?: StatementBundle; error?: string }> {
    const { user } = await getAuthUser()
    if (!user) return { error: 'Not signed in' }

    // Resolve the partner the same way the rest of the dashboard does, so a
    // platform-support (ghost) seat reports the account it is acting on.
    const partnerId = await getActingPartnerId(user.id)
    if (!partnerId) return { error: 'No partner account' }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.from) || !/^\d{4}-\d{2}-\d{2}$/.test(opts.to)) {
        return { error: 'Invalid date range' }
    }
    if (opts.from > opts.to) return { error: 'Start date is after the end date' }

    const supabase = await createClient()

    // Scope resolution happens BEFORE the fetches, both because they need the
    // id and because an unowned event must fail here rather than return an
    // empty statement that looks like a quiet month.
    const eventId = opts.eventId || null
    let scope: StatementScope | null = null
    if (eventId) {
        const { data: ev } = await supabase
            .from('events')
            .select('id, title, organizer_id')
            .eq('id', eventId)
            .maybeSingle()
        // Events are publicly readable, so ownership is checked explicitly —
        // RLS will not stop one organizer asking for another's event.
        if (!ev || ev.organizer_id !== partnerId) return { error: 'Event not found' }
        scope = { eventId: ev.id, eventTitle: ev.title }
    }

    try {
        const expQuery = eventId
            // Experiences are a separate ledger with no event to belong to, so
            // a scoped statement excludes them rather than reporting an
            // account-wide figure under one event's name.
            ? Promise.resolve({ data: [] as Record<string, unknown>[] })
            : supabase
                .from('experience_transactions')
                // discount_amount added 2026-10-12. Omitting it on a discounted
                // sale is the single most common way to produce a statement
                // that does not foot — the exact trap FeeRow documents.
                .select('gross_amount, discount_amount, platform_fee, host_payout')
                .eq('partner_id', partnerId)
                .in('status', ['completed', 'refunded'])
                .gte('created_at', dayStart(opts.from))
                .lte('created_at', dayEnd(opts.to))

        let merchQuery = supabase
            .from('merch_transactions')
            .select('gross_amount, platform_fee, payment_processing_fee, organizer_payout')
            .eq('organizer_id', partnerId)
            .in('status', ['completed', 'refunded'])
            .gte('created_at', dayStart(opts.from))
            .lte('created_at', dayEnd(opts.to))
        if (eventId) merchQuery = merchQuery.eq('event_id', eventId)

        // Deliberately empty when scoped. See StatementScope: a payout is an
        // account-level withdrawal and cannot be attributed to an event.
        const payoutQuery = eventId
            ? Promise.resolve({ data: [] as Record<string, unknown>[] })
            : supabase
                .from('payouts')
                .select('id, amount, status, requested_at, completed_at, bank_name, bank_account_number, xendit_disbursement_id')
                .eq('partner_id', partnerId)
                .gte('requested_at', dayStart(opts.from))
                .lte('requested_at', dayEnd(opts.to))
                .order('requested_at', { ascending: true })

        let doorQuery = supabase
            .from('purchase_intents')
            .select('total_amount, event:events!inner(organizer_id)')
            .eq('source', 'box_office')
            .eq('status', 'completed')
            .eq('event.organizer_id', partnerId)
            .gte('created_at', dayStart(opts.from))
            .lte('created_at', dayEnd(opts.to))
        if (eventId) doorQuery = doorQuery.eq('event_id', eventId)

        const [ticketRes, partnerRes, expRes, merchRes, payoutRes, doorRes] = await Promise.all([
            pagedTickets(supabase, partnerId, opts.from, opts.to, eventId),
            supabase.from('partners').select('business_name').eq('id', partnerId).maybeSingle(),
            expQuery,
            merchQuery,
            payoutQuery,
            doorQuery,
        ])

        const ticketRows = ticketRes.rows

        // The discount lives on the intent, not the transaction. Fold it onto the
        // row before the fee model sees it — without this every discounted sale
        // fails to reconcile (60 rows, ₱5,530 on prod today).
        const ticketFeeRows: FeeRow[] = ticketRows.map(r => {
            const pi = flat(r.purchase_intent)
            return { ...r, discount_amount: pi?.discount_amount ?? 0 }
        })

        const tickets = sumFees(ticketFeeRows)

        // Experiences bill a platform fee only — no processing fee, no tax —
        // so those fields are left undefined rather than zeroed.
        const experiences = sumFees(
            (expRes.data ?? []).map((r: Record<string, unknown>) => ({
                gross_amount: money(r.gross_amount),
                discount_amount: money(r.discount_amount),
                platform_fee: money(r.platform_fee),
                organizer_payout: money(r.host_payout),
            })),
        )

        const merch = sumFees(
            (merchRes.data ?? []).map((r: Record<string, unknown>) => ({
                gross_amount: money(r.gross_amount),
                platform_fee: money(r.platform_fee),
                payment_processing_fee: money(r.payment_processing_fee),
                organizer_payout: money(r.organizer_payout),
            })),
        )

        const combined = sumFees([
            ...ticketFeeRows,
            ...(expRes.data ?? []).map((r: Record<string, unknown>) => ({
                gross_amount: money(r.gross_amount),
                discount_amount: money(r.discount_amount),
                platform_fee: money(r.platform_fee),
                organizer_payout: money(r.host_payout),
            })),
            ...(merchRes.data ?? []).map((r: Record<string, unknown>) => ({
                gross_amount: money(r.gross_amount),
                platform_fee: money(r.platform_fee),
                payment_processing_fee: money(r.payment_processing_fee),
                organizer_payout: money(r.organizer_payout),
            })),
        ])

        // Fees the buyer fronted instead of the organizer. Recorded on the intent
        // when the organizer has the pass-fees toggle on.
        const buyerPaidFees = ticketRows.reduce((sum, r) => {
            const pi = flat(r.purchase_intent)
            const passed = pi?.metadata?.['passed_fee']
            return sum + money(passed)
        }, 0)

        // A refund is a reversal row carrying a negative payout. Counting those
        // separately lets the statement show gross activity and the reversal of
        // it, rather than a net figure with no explanation.
        const refundRows = ticketFeeRows.filter(r => Number(r.organizer_payout) < 0)
        const refunds = {
            count: refundRows.length,
            amount: refundRows.reduce((s, r) => s + Number(r.organizer_payout), 0),
        }

        const byEventMap = new Map<string, StatementEventLine>()
        const ledger: StatementRow[] = []
        for (const r of ticketRows) {
            const id = r.event_id || 'unknown'
            const title = flat(r.event)?.title || 'Unknown event'
            const pi = flat(r.purchase_intent)
            const f = computeFees({ ...r, discount_amount: pi?.discount_amount ?? 0 })

            const line = byEventMap.get(id) ?? { eventId: id, title, count: 0, revenue: 0, fees: 0, net: 0 }
            line.count += 1
            line.revenue += f.revenue
            line.fees += f.totalFees
            line.net += f.netPayout
            byEventMap.set(id, line)

            ledger.push({
                id: r.id,
                date: r.created_at,
                event: title,
                method: pi?.payment_method ? pi.payment_method.toUpperCase() : 'UNKNOWN',
                revenue: f.revenue,
                fees: f.totalFees,
                net: f.netPayout,
                status: r.status,
                odd: !f.reconciles,
            })
        }
        const byEvent = [...byEventMap.values()].sort((a, b) => b.net - a.net)

        // Newest first: a statement is read from the most recent activity back.
        ledger.reverse()
        const detailOmitted = ledger.length > DETAIL_LIMIT

        const payouts: StatementPayoutLine[] = (payoutRes.data ?? []).map((p: Record<string, unknown>) => ({
            id: String(p.id),
            amount: money(p.amount),
            status: String(p.status),
            requestedAt: (p.requested_at as string) ?? null,
            completedAt: (p.completed_at as string) ?? null,
            bankName: (p.bank_name as string) ?? null,
            maskedAccount: maskAccount((p.bank_account_number as string) ?? null),
            reference: (p.xendit_disbursement_id as string) ?? null,
        }))

        return {
            bundle: {
                partnerName: partnerRes.data?.business_name || 'Your account',
                scope,
                period: { from: opts.from, to: opts.to },
                generatedAt: new Date().toISOString(),
                tickets,
                experiences,
                merch,
                combined,
                buyerPaidFees,
                refunds,
                payouts,
                paidOutInPeriod: payouts
                    .filter(p => p.status === 'completed')
                    .reduce((s, p) => s + p.amount, 0),
                byEvent,
                rows: detailOmitted ? [] : ledger,
                detailOmitted,
                doorCollected: (doorRes.data ?? []).reduce(
                    (s: number, r: Record<string, unknown>) => s + money(r.total_amount), 0,
                ),
                unreconciled: combined.unreconciled,
                truncated: ticketRes.truncated,
            },
        }
    } catch (err) {
        console.error('getPayoutStatement:', err)
        return { error: 'Could not build the statement.' }
    }
}

export type AdviceBundle = {
    partnerName: string
    payout: StatementPayoutLine
    generatedAt: string
}

/**
 * One disbursement, for the organizer to file or forward as proof of receipt.
 *
 * Deliberately NOT itemised — see the note at the top of this file. What it can
 * state truthfully is the amount, when it was requested and settled, where it
 * went, and the gateway reference to quote in a dispute.
 */
export async function getPayoutAdvice(
    payoutId: string,
): Promise<{ bundle?: AdviceBundle; error?: string }> {
    const { user } = await getAuthUser()
    if (!user) return { error: 'Not signed in' }

    const partnerId = await getActingPartnerId(user.id)
    if (!partnerId) return { error: 'No partner account' }

    const supabase = await createClient()

    const [{ data: p, error }, partnerRes] = await Promise.all([
        supabase
            .from('payouts')
            .select('id, amount, status, requested_at, completed_at, bank_name, bank_account_number, xendit_disbursement_id')
            // Scoped to the partner as well as the id: an id alone would let one
            // organizer fetch another's advice by guessing a uuid.
            .eq('partner_id', partnerId)
            .eq('id', payoutId)
            .maybeSingle(),
        supabase.from('partners').select('business_name').eq('id', partnerId).maybeSingle(),
    ])

    if (error) {
        console.error('getPayoutAdvice:', error)
        return { error: 'Could not load that payout.' }
    }
    if (!p) return { error: 'Payout not found' }

    return {
        bundle: {
            partnerName: partnerRes.data?.business_name || 'Your account',
            generatedAt: new Date().toISOString(),
            payout: {
                id: String(p.id),
                amount: money(p.amount),
                status: String(p.status),
                requestedAt: p.requested_at ?? null,
                completedAt: p.completed_at ?? null,
                bankName: p.bank_name ?? null,
                maskedAccount: maskAccount(p.bank_account_number ?? null),
                reference: p.xendit_disbursement_id ?? null,
            },
        },
    }
}
