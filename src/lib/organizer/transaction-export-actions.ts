'use server'

import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getActingPartnerId } from '@/lib/auth/cached'
import { getSettlementInfo, getPaymentChannel } from '@/lib/utils/settlement'

/**
 * The Transactions tab export, built on the server over the WHOLE filtered set.
 *
 * It used to run in the browser over the `transactions` prop — which is ONE PAGE
 * of 10 rows. An organizer filtered to a date range, pressed Export, and got a
 * 10-row CSV with no warning: Upper Room Worship (453 transactions) and THE
 * KOOLPALS (425) both exported 10. Silent truncation on a sales report is worse
 * than no export at all, because nothing on screen says the file is short.
 *
 * The same mistake was already found and fixed once for the summary card above
 * this table — see getTransactionTotals, which aggregates in Postgres precisely
 * because summing the visible page "made the card read ₱54,000 · Count 23
 * against a real gross of ₱149,000". The export was not fixed at the same time.
 *
 * Filters mirror getTransactions() in the payouts page exactly. If one changes,
 * change both or the file stops matching the table it came from.
 */

const PAGE = 1000
/** Hard ceiling so one partner cannot pull an unbounded result into memory.
 *  The caller is told when it bites rather than being handed a short file. */
const EXPORT_CAP = 20000

type Row = {
    id: string
    gross_amount: number
    organizer_payout: number
    status: string
    created_at: string
    event: { title: string } | { title: string }[] | null
    purchase_intent: {
        payment_method: string | null
        settlement_status?: string | null
        estimated_settlement_time?: string | null
        settled_at?: string | null
    } | null
}

/** Quote every field and double any embedded quote: event titles contain commas
 *  ("Pound Puppies - GM Yuro") and apostrophes, and an unquoted one shifts every
 *  column after it by one. */
function cell(v: unknown): string {
    return `"${String(v ?? '').replace(/"/g, '""')}"`
}

function manila(iso: string, withTime: boolean): string {
    return new Date(iso).toLocaleString('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric', month: '2-digit', day: '2-digit',
        ...(withTime ? { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false } : {}),
    }).replace(',', '')
}

export async function exportTransactionsCsv(
    opts: { from?: string; to?: string; search?: string } = {}
): Promise<{ csv?: string; filename?: string; rows?: number; truncated?: boolean; error?: string }> {
    const { user } = await getAuthUser()
    if (!user) return { error: 'Not signed in' }

    // Resolve the partner the same way the rest of the dashboard does, so a
    // platform-support (ghost) seat exports the account it is acting on.
    const partnerId = await getActingPartnerId(user.id)
    if (!partnerId) return { error: 'No partner account' }

    const supabase = await createClient()

    const rows: Row[] = []
    let truncated = false

    for (let offset = 0; offset < EXPORT_CAP; offset += PAGE) {
        let q = supabase
            .from('transactions')
            .select(`
                id,
                gross_amount,
                organizer_payout,
                status,
                created_at,
                event:events!inner ( title ),
                purchase_intent:purchase_intents (
                    payment_method,
                    settlement_status,
                    estimated_settlement_time,
                    settled_at
                )
            `)
            .eq('partner_id', partnerId)
            .order('created_at', { ascending: false })
            .range(offset, offset + PAGE - 1)

        if (opts.from) q = q.gte('created_at', opts.from)
        if (opts.to) q = q.lte('created_at', `${opts.to}T23:59:59`)

        if (opts.search) {
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(opts.search)
            if (isUUID) q = q.eq('id', opts.search)
            else q = q.ilike('event.title', `%${opts.search}%`)
        }

        const { data: chunk, error } = await q
        if (error) {
            console.error('exportTransactionsCsv error:', error)
            return { error: 'Could not build the export.' }
        }

        rows.push(...((chunk ?? []) as unknown as Row[]))

        // A short page means the end of the set. Without this the loop would run
        // all 20 pages for a partner with 34 transactions.
        if (!chunk || chunk.length < PAGE) break
        if (rows.length >= EXPORT_CAP) { truncated = true; break }
    }

    const header = [
        'Date', 'Event', 'Channel', 'Payment Method',
        'Amount', 'Total Fees', 'Net Payout',
        'Status', 'Settlement Status', 'Settlement ETA',
    ]

    const lines = [header.map(cell).join(',')]
    for (const t of rows) {
        const ev = Array.isArray(t.event) ? t.event[0] : t.event
        const pi = t.purchase_intent
        const settlement = getSettlementInfo(t.created_at, pi?.payment_method, {
            status: pi?.settlement_status,
            etaTime: pi?.estimated_settlement_time,
            settledAt: pi?.settled_at,
        })
        lines.push([
            cell(manila(t.created_at, true)),
            cell(ev?.title || 'Unknown'),
            cell(getPaymentChannel(pi?.payment_method)),
            cell(pi?.payment_method?.toUpperCase() || 'UNKNOWN'),
            cell(t.gross_amount),
            cell(Number(t.gross_amount) - Number(t.organizer_payout)),
            cell(t.organizer_payout),
            cell(t.status),
            cell(settlement.status),
            cell(manila(settlement.etaDate.toISOString(), false)),
        ].join(','))
    }

    // The filename carries the range so two exports taken on the same day for
    // different periods do not land in Downloads as "(1)" and "(2)".
    const range = opts.from || opts.to
        ? `-${opts.from || 'start'}_${opts.to || 'today'}`
        : ''
    const stamp = manila(new Date().toISOString(), false)

    return {
        csv: lines.join('\n'),
        filename: `transactions${range}-${stamp}.csv`,
        rows: rows.length,
        truncated,
    }
}
