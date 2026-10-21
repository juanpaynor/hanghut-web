/**
 * The Transactions-tab export: one set of rows, three documents.
 *
 * This module is deliberately NOT `'use server'`. It is imported by a route
 * handler (src/app/api/organizer/transactions/export/route.ts) which streams
 * the finished file back over plain HTTP.
 *
 * ── Why a route and not a server action ──────────────────────────────
 *
 * The export used to be a server action returning a CSV string, which the
 * browser then turned into a Blob and clicked through a temporary <a>. That
 * worked, but it put the whole download behind one React promise and one
 * object URL, and the organizer's only feedback was a button that said
 * "Preparing…" until the promise settled. A route handler gives the browser a
 * real HTTP response with a real Content-Disposition, so the file does not
 * have to travel through the RSC payload and the three formats share one
 * code path instead of each growing its own.
 *
 * ── Why PHP and not ₱ in the PDF ─────────────────────────────────────
 *
 * Same reason statement-pdf.ts documents: jsPDF's built-in Helvetica is
 * WinAnsi-encoded and has no glyph at U+20B1, so a peso sign renders as the
 * wrong character or as nothing at all — silently, on a financial document.
 * The CSV and the workbook are UTF-8 and use the real sign.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSettlementInfo, getPaymentChannel } from '@/lib/utils/settlement'

export const EXPORT_FORMATS = ['csv', 'xlsx', 'pdf'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

export function isExportFormat(v: string | null): v is ExportFormat {
    return !!v && (EXPORT_FORMATS as readonly string[]).includes(v)
}

const PAGE = 1000

/** Hard ceiling so one partner cannot pull an unbounded result into memory.
 *  The caller is told when it bites rather than being handed a short file. */
export const EXPORT_CAP = 20000

/** A PDF is a document, not a database dump. Past this many rows the line-item
 *  table is dropped and the document carries the summary and the per-event
 *  breakdown only, with a note pointing at the CSV — which is the right shape
 *  for a 14,000-row ledger anyway. Mirrors StatementBundle.detailOmitted. */
export const PDF_DETAIL_CAP = 1200

export interface ExportFilters {
    from?: string
    to?: string
    search?: string
}

export interface ExportRow {
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
        refunded_amount?: number | null
    } | null
}

export interface ExportBundle {
    rows: ExportRow[]
    truncated: boolean
    partnerName: string
    filters: ExportFilters
    generatedAt: string
}

/**
 * Every transaction matching the filter, not just the page on screen.
 *
 * The filters mirror getTransactions() in the payouts page exactly. If one
 * changes, change both or the file stops matching the table it came from.
 *
 * This used to live in the browser over the `transactions` prop — ONE PAGE of
 * 10 rows — so a filtered export silently produced a 10-row file: 10 of 453
 * for Upper Room Worship, 10 of 425 for THE KOOLPALS. Silent truncation on a
 * sales report is worse than no export at all, because nothing on screen says
 * the file is short.
 */
export async function fetchExportRows(
    supabase: SupabaseClient,
    partnerId: string,
    filters: ExportFilters,
): Promise<{ rows: ExportRow[]; truncated: boolean }> {
    const rows: ExportRow[] = []
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
                    settled_at,
                    refunded_amount
                )
            `)
            .eq('partner_id', partnerId)
            .order('created_at', { ascending: false })
            .range(offset, offset + PAGE - 1)

        if (filters.from) q = q.gte('created_at', filters.from)
        if (filters.to) q = q.lte('created_at', `${filters.to}T23:59:59`)

        if (filters.search) {
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filters.search)
            if (isUUID) q = q.eq('id', filters.search)
            else q = q.ilike('event.title', `%${filters.search}%`)
        }

        const { data: chunk, error } = await q
        if (error) throw new Error(error.message)

        rows.push(...((chunk ?? []) as unknown as ExportRow[]))

        // A short page means the end of the set. Without this the loop would
        // run all 20 pages for a partner with 34 transactions.
        if (!chunk || chunk.length < PAGE) break
        if (rows.length >= EXPORT_CAP) { truncated = true; break }
    }

    return { rows, truncated }
}

// ── Shared derivations ──────────────────────────────────────────────────
//
// Every format reads the row through these, so the CSV, the workbook and the
// PDF cannot disagree with each other or with the table on screen.

const title = (r: ExportRow) =>
    (Array.isArray(r.event) ? r.event[0]?.title : r.event?.title) || 'Unknown event'

/** Fees = what was actually taken (Amount − Net Payout). Derived rather than
 *  summed from the fee columns because organizer_payout used different fee
 *  rules across eras, so the raw columns don't equal the real deduction. */
const fees = (r: ExportRow) => Number(r.gross_amount) - Number(r.organizer_payout)

const refunded = (r: ExportRow) => Number(r.purchase_intent?.refunded_amount || 0)

const settlementOf = (r: ExportRow) =>
    getSettlementInfo(r.created_at, r.purchase_intent?.payment_method, {
        status: r.purchase_intent?.settlement_status,
        etaTime: r.purchase_intent?.estimated_settlement_time,
        settledAt: r.purchase_intent?.settled_at,
    })

/** The on-screen Status column shows "Refunded" whenever the intent carries a
 *  refund, regardless of the transaction's own status. The file must say the
 *  same thing or a reconciled row looks like an unreconciled one. */
const statusOf = (r: ExportRow) => (refunded(r) > 0 ? 'refunded' : r.status)

function manila(iso: string, withTime: boolean): string {
    return new Date(iso).toLocaleString('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric', month: '2-digit', day: '2-digit',
        ...(withTime ? { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false } : {}),
    }).replace(',', '')
}

export interface ExportTotals {
    count: number
    gross: number
    payout: number
    fees: number
    refunds: number
    net: number
}

/** Refund-reversal rows carry a negative gross and are excluded, matching the
 *  on-screen list: the refund is surfaced from the intent's refunded_amount
 *  instead, so nothing double-counts. */
export function totalsOf(rows: ExportRow[]): ExportTotals {
    const sales = rows.filter(r => Number(r.gross_amount) >= 0)
    const gross = sales.reduce((s, r) => s + Number(r.gross_amount), 0)
    const payout = sales.reduce((s, r) => s + Number(r.organizer_payout), 0)
    const refunds = sales.reduce((s, r) => s + refunded(r), 0)
    return {
        count: sales.length,
        gross,
        payout,
        fees: gross - payout,
        refunds,
        net: payout - refunds,
    }
}

/** Per-event subtotals, biggest first — the breakdown an organizer actually
 *  reconciles against, and the only table a too-large PDF keeps. */
export function byEventOf(rows: ExportRow[]) {
    const map = new Map<string, { title: string; count: number; gross: number; payout: number; refunds: number }>()
    for (const r of rows) {
        if (Number(r.gross_amount) < 0) continue
        const t = title(r)
        const row = map.get(t) ?? { title: t, count: 0, gross: 0, payout: 0, refunds: 0 }
        row.count += 1
        row.gross += Number(r.gross_amount)
        row.payout += Number(r.organizer_payout)
        row.refunds += refunded(r)
        map.set(t, row)
    }
    return [...map.values()].sort((a, b) => b.gross - a.gross)
}

/** The period as a human reads it, for a document heading. */
export function periodLabel(f: ExportFilters): string {
    if (f.from && f.to) return `${f.from} to ${f.to}`
    if (f.from) return `${f.from} onwards`
    if (f.to) return `up to ${f.to}`
    return 'All time'
}

/** The filename carries the range so two exports taken on the same day for
 *  different periods do not land in Downloads as "(1)" and "(2)". */
export function exportFilename(f: ExportFilters, format: ExportFormat): string {
    const range = f.from || f.to ? `-${f.from || 'start'}_${f.to || 'today'}` : ''
    return `transactions${range}-${manila(new Date().toISOString(), false)}.${format}`
}

const HEADER = [
    'Transaction ID', 'Date', 'Event', 'Channel', 'Payment Method',
    'Amount', 'Total Fees', 'Net Payout', 'Refunded',
    'Status', 'Settlement Status', 'Settlement ETA',
] as const

/** One row, as plain values. The CSV quotes them and the workbook keeps the
 *  numbers numeric, so neither has to re-derive anything. */
function tabular(r: ExportRow): (string | number)[] {
    const s = settlementOf(r)
    return [
        r.id,
        manila(r.created_at, true),
        title(r),
        getPaymentChannel(r.purchase_intent?.payment_method),
        r.purchase_intent?.payment_method?.toUpperCase() || 'UNKNOWN',
        Number(r.gross_amount),
        fees(r),
        Number(r.organizer_payout),
        refunded(r),
        statusOf(r),
        s.status,
        manila(s.etaDate.toISOString(), false),
    ]
}

// ── CSV ─────────────────────────────────────────────────────────────────

/** Quote every field and double any embedded quote: event titles contain
 *  commas ("Pound Puppies - GM Yuro") and apostrophes, and an unquoted one
 *  shifts every column after it by one. */
function cell(v: unknown): string {
    return `"${String(v ?? '').replace(/"/g, '""')}"`
}

/**
 * The BOM is not decoration. Excel on Windows reads a UTF-8 CSV as the system
 * codepage unless one is present, which turns every ₱ and every é in an event
 * title into mojibake. The registrations export already prepends it; this one
 * did not.
 */
export function buildCsv(bundle: ExportBundle): string {
    const lines = [HEADER.map(cell).join(',')]
    for (const r of bundle.rows) lines.push(tabular(r).map(cell).join(','))
    return '﻿' + lines.join('\r\n')
}

// ── Workbook ────────────────────────────────────────────────────────────

/**
 * A real .xlsx, so the figures arrive as numbers an accountant can sum
 * rather than text that needs a Text-to-Columns pass first. Two sheets: the
 * ledger, and a Summary that reproduces the on-screen cards so the file can
 * be checked against the dashboard without adding anything up.
 */
export async function buildXlsx(bundle: ExportBundle): Promise<Uint8Array> {
    // `.default ?? module` because SheetJS is CommonJS: depending on how the
    // bundler interops it, the namespace either carries `utils` directly or
    // hides it behind `default`. Reading the wrong one is an
    // undefined-property throw at the point of no return.
    const mod: any = await import('xlsx')
    const XLSX = mod?.utils ? mod : mod?.default
    if (!XLSX?.utils) throw new Error('Could not load the spreadsheet writer.')

    const t = totalsOf(bundle.rows)

    const ledger = XLSX.utils.aoa_to_sheet([
        [...HEADER],
        ...bundle.rows.map(tabular),
    ])
    ledger['!cols'] = [
        { wch: 38 }, { wch: 20 }, { wch: 34 }, { wch: 14 }, { wch: 16 },
        { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 },
        { wch: 12 }, { wch: 14 }, { wch: 14 },
    ]
    // Freeze the header so a 453-row ledger stays readable while scrolling.
    ledger['!freeze'] = { xSplit: 0, ySplit: 1 }

    const summary = XLSX.utils.aoa_to_sheet([
        ['HangHut — Transactions export'],
        ['Organizer', bundle.partnerName],
        ['Period', periodLabel(bundle.filters)],
        ...(bundle.filters.search ? [['Search', bundle.filters.search]] : []),
        ['Generated', manila(bundle.generatedAt, true) + ' (Asia/Manila)'],
        [],
        ['Transactions', t.count],
        ['Total incoming (PHP)', t.gross],
        ['Fees (PHP)', -t.fees],
        ['Refunded (PHP)', -t.refunds],
        ['Net earnings (PHP)', t.net],
        [],
        ['By event', 'Transactions', 'Incoming (PHP)', 'Refunded (PHP)', 'Net payout (PHP)'],
        ...byEventOf(bundle.rows).map(e => [e.title, e.count, e.gross, -e.refunds, e.payout - e.refunds]),
        ...(bundle.truncated
            ? [[], [`Only the first ${EXPORT_CAP.toLocaleString()} transactions are included. Narrow the date range for the rest.`]]
            : []),
    ])
    summary['!cols'] = [{ wch: 34 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 18 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, summary, 'Summary')
    XLSX.utils.book_append_sheet(wb, ledger, 'Transactions')

    // SheetJS's `type: 'array'` returns an ArrayBuffer, not a typed array —
    // despite the name. Wrapping it here keeps the signature honest and gives
    // the route one body type for all three formats.
    return new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer)
}

// ── PDF ─────────────────────────────────────────────────────────────────

const INK = '#17152F'
const MUTED = '#5B5878'
const HEAD: [number, number, number] = [23, 21, 48]
/** autotable's default head text is white, but a `styles.textColor` applies to
 *  the head row too and silently overrides it — which painted dark ink on the
 *  dark navy header bar and left every column label invisible. Every headStyles
 *  here therefore sets its own colour. */
const HEAD_TEXT = '#FFFFFF'
const MARGIN = 14
/** jsPDF's A4 landscape long edge is 297mm; the short edge is 209.903mm, not a
 *  round 210. Fixed column widths summed against 210 overflow by a fraction of
 *  a millimetre and autotable warns on every build. */
const PAGE_W = 297

/** Amounts are right-aligned, so they must not carry a currency prefix of
 *  varying width in the table body — the code sits in the header instead. */
function amount(n: number): string {
    const v = Math.abs(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return n < 0 ? `(${v})` : v
}

const rightHead = (label: string) => ({ content: label, styles: { halign: 'right' as const } })

/**
 * The transactions report. Landscape, because twelve columns have no chance of
 * fitting portrait, and summary-first so the document answers "what did this
 * period earn" before it answers "which sale was which".
 */
export async function buildPdf(bundle: ExportBundle): Promise<Uint8Array> {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')

    const doc = new jsPDF({ orientation: 'landscape', format: 'a4' }) as any
    const t = totalsOf(bundle.rows)
    const period = periodLabel(bundle.filters)

    // ── Heading
    doc.setTextColor(INK)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('Transactions', MARGIN, 18)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(bundle.partnerName, MARGIN, 25)

    doc.setFontSize(8)
    doc.setTextColor(MUTED)
    doc.text(period, PAGE_W - MARGIN, 18, { align: 'right' })
    doc.text(
        `Generated ${manila(bundle.generatedAt, true)} (Asia/Manila)`,
        PAGE_W - MARGIN, 25, { align: 'right' },
    )
    if (bundle.filters.search) {
        doc.text(`Filtered by "${bundle.filters.search}"`, PAGE_W - MARGIN, 30, { align: 'right' })
    }

    // ── Summary. The same five figures as the on-screen cards, in the same
    //    derivation, so the document cannot disagree with the dashboard.
    autoTable(doc, {
        startY: 36,
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: { top: 1.5, bottom: 1.5, left: 0, right: 6 }, textColor: INK },
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
        body: [
            ['Transactions', t.count.toLocaleString()],
            ['Total incoming', `PHP ${amount(t.gross)}`],
            ['Fees', `PHP ${amount(-t.fees)}`],
            ...(t.refunds > 0 ? [['Refunded', `PHP ${amount(-t.refunds)}`]] : []),
            ['Net earnings', `PHP ${amount(t.net)}`],
        ],
        margin: { left: MARGIN, right: PAGE_W / 2 },
        tableWidth: PAGE_W / 2 - MARGIN,
    })

    let y = (doc.lastAutoTable?.finalY ?? 36) + 8

    // ── By event
    const events = byEventOf(bundle.rows)
    if (events.length > 1) {
        autoTable(doc, {
            startY: y,
            head: [['Event', rightHead('Transactions'), rightHead('Incoming'), rightHead('Refunded'), rightHead('Net payout')]],
            body: events.map(e => [
                e.title,
                e.count.toLocaleString(),
                amount(e.gross),
                e.refunds > 0 ? amount(-e.refunds) : '—',
                amount(e.payout - e.refunds),
            ]),
            styles: { fontSize: 8, textColor: INK },
            headStyles: { fillColor: HEAD, textColor: HEAD_TEXT, fontSize: 8 },
            columnStyles: {
                1: { halign: 'right', cellWidth: 26 },
                2: { halign: 'right', cellWidth: 32 },
                3: { halign: 'right', cellWidth: 32 },
                4: { halign: 'right', cellWidth: 32 },
            },
            margin: { left: MARGIN, right: MARGIN },
        })
        y = (doc.lastAutoTable?.finalY ?? y) + 8
    }

    // ── Line items
    if (bundle.rows.length > PDF_DETAIL_CAP) {
        doc.setFontSize(8)
        doc.setTextColor(MUTED)
        doc.text(
            `${bundle.rows.length.toLocaleString()} transactions — too many to list line by line. `
            + 'Export as CSV or Excel for the full ledger.',
            MARGIN, y + 2,
        )
    } else {
        autoTable(doc, {
            startY: y,
            head: [[
                'Date', 'Event', 'Channel', 'Method',
                rightHead('Amount'), rightHead('Fees'), rightHead('Net payout'), rightHead('Refunded'),
                'Status', 'Settlement',
            ]],
            body: bundle.rows.map(r => {
                const s = settlementOf(r)
                return [
                    manila(r.created_at, true),
                    title(r),
                    getPaymentChannel(r.purchase_intent?.payment_method),
                    r.purchase_intent?.payment_method?.toUpperCase() || 'UNKNOWN',
                    amount(Number(r.gross_amount)),
                    amount(-fees(r)),
                    amount(Number(r.organizer_payout)),
                    refunded(r) > 0 ? amount(-refunded(r)) : '—',
                    statusOf(r),
                    s.status === 'settled'
                        ? (s.estimated ? `Est. settled ${manila(s.etaDate.toISOString(), false)}` : 'Settled')
                        : `Pending ${manila(s.etaDate.toISOString(), false)}`,
                ]
            }),
            styles: { fontSize: 7, cellPadding: 1.5, textColor: INK, overflow: 'linebreak' },
            headStyles: { fillColor: HEAD, textColor: HEAD_TEXT, fontSize: 7 },
            columnStyles: {
                0: { cellWidth: 28 },
                2: { cellWidth: 20 },
                3: { cellWidth: 22 },
                4: { halign: 'right', cellWidth: 24 },
                5: { halign: 'right', cellWidth: 22 },
                6: { halign: 'right', cellWidth: 24 },
                7: { halign: 'right', cellWidth: 22 },
                8: { cellWidth: 20 },
                9: { cellWidth: 36 },
            },
            margin: { left: MARGIN, right: MARGIN },
        })
    }

    // ── Footer on every page
    const note = bundle.truncated
        ? `Only the first ${EXPORT_CAP.toLocaleString()} transactions are included — narrow the date range for the rest.`
        : 'Amounts in PHP. Settlement dates marked "Est." are our estimate, not confirmed by Xendit.'
    const pages = doc.getNumberOfPages()
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i)
        const h = doc.internal.pageSize.getHeight()
        doc.setFontSize(7)
        doc.setTextColor(MUTED)
        doc.text(`${period}  ·  ${note}`, MARGIN, h - 8)
        doc.text(`Page ${i} of ${pages}`, PAGE_W - MARGIN, h - 8, { align: 'right' })
    }

    return new Uint8Array(doc.output('arraybuffer'))
}

export const CONTENT_TYPE: Record<ExportFormat, string> = {
    csv: 'text/csv; charset=utf-8',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pdf: 'application/pdf',
}
