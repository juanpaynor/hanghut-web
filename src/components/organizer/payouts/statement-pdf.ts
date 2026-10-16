import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
// Types only — erased at build, so importing from a 'use server' module is safe.
import type { StatementBundle, AdviceBundle } from '@/lib/organizer/payout-statement-actions'

/**
 * The payout statement and the payout advice, rendered in the browser.
 *
 * Built here rather than on the server for the reason getEventResponsesExport
 * already documents: jsPDF is in the bundle for the attendee export, and
 * streaming a generated binary back through the RSC payload would mean base64
 * for no gain. Every NUMBER on the page comes from the server bundle, so the
 * PDF cannot disagree with the CSV or the on-screen summary.
 *
 * ── Why "PHP 1,000.00" and not "₱1,000.00" ───────────────────────────
 *
 * jsPDF's built-in Helvetica is WinAnsi-encoded and has no glyph at U+20B1.
 * A peso sign renders as the wrong character or as nothing at all — on a
 * financial document, silently. Embedding a Unicode font would cost a few
 * hundred KB in the bundle to print one glyph, and the ISO 4217 code is the
 * more conventional choice on a statement an accountant will read anyway.
 */

const INK = '#17152F'
const MUTED = '#5B5878'
const RULE: [number, number, number] = [220, 219, 228]
const HEAD: [number, number, number] = [23, 21, 48]

const MARGIN = 14
/** jsPDF's A4 is 595.28pt = 209.903mm, not a round 210. Fixed column widths
 *  summed against 210 overflow the page by a fraction of a millimetre and
 *  autotable warns on every build. */
const PAGE_W = 209.9

/** Amounts are right-aligned in columns, so they must not carry a currency
 *  prefix of varying width in the table body — the code sits in the header. */
function amount(n: number): string {
    const v = Math.abs(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return n < 0 ? `(${v})` : v
}

function withCode(n: number): string {
    return `PHP ${amount(n)}`
}

function manilaDate(iso: string): string {
    return new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila', day: '2-digit', month: 'short', year: 'numeric',
    }).format(new Date(iso))
}

function manilaDateTime(iso: string): string {
    return new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila', day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(new Date(iso))
}

/** `2026-10-01` is a plain date with no zone; parsing it as UTC and formatting
 *  in Manila would shift it a day. Format the parts directly. */
function plainDate(ymd: string): string {
    const [y, m, d] = ymd.split('-').map(Number)
    return new Intl.DateTimeFormat('en-PH', { day: '2-digit', month: 'short', year: 'numeric' })
        .format(new Date(Date.UTC(y, m - 1, d, 12)))
}

/** autotable does not carry columnStyles.halign into the header row, so a
 *  right-aligned money column otherwise gets a left-aligned label sitting over
 *  right-aligned figures. */
const rightHead = (label: string) => ({ content: label, styles: { halign: 'right' as const } })

type Doc = jsPDF & { lastAutoTable?: { finalY: number } }

function afterTable(doc: Doc, fallback: number): number {
    return (doc.lastAutoTable?.finalY ?? fallback) + 8
}

function footer(doc: Doc, note: string, period?: string) {
    const pages = doc.getNumberOfPages()
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i)
        const h = doc.internal.pageSize.getHeight()
        doc.setFontSize(7.5)
        doc.setTextColor(MUTED)
        doc.text(period ? `${period}  ·  ${note}` : note, MARGIN, h - 9)
        doc.text(`Page ${i} of ${pages}`, PAGE_W - MARGIN, h - 9, { align: 'right' })
    }
}

function heading(doc: Doc, bundle: { partnerName: string; generatedAt: string }, title: string, sub: string) {
    doc.setFontSize(19)
    doc.setTextColor(INK)
    doc.setFont('helvetica', 'bold')
    doc.text(title, MARGIN, 22)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10.5)
    doc.text(bundle.partnerName, MARGIN, 30)

    doc.setFontSize(9)
    doc.setTextColor(MUTED)
    doc.text(sub, MARGIN, 36)
    doc.text(`Generated ${manilaDateTime(bundle.generatedAt)}`, PAGE_W - MARGIN, 36, { align: 'right' })

    doc.setDrawColor(...RULE)
    doc.line(MARGIN, 40, PAGE_W - MARGIN, 40)
}

/* ───────────────────────── Statement ───────────────────────── */

export function buildStatementPdf(b: StatementBundle): Doc {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' }) as Doc
    const c = b.combined

    const period = `${plainDate(b.period.from)} to ${plainDate(b.period.to)}`
    heading(
        doc, b,
        // Named for what it can prove. A scoped document reports earnings and
        // no payouts, so calling it a "payout statement" would promise a
        // settlement it does not contain.
        b.scope ? 'Event earnings statement' : 'Payout statement',
        b.scope ? `${b.scope.eventTitle}  ·  ${period}` : period,
    )

    // ── The waterfall. Indented sub-lines are components of the line above,
    //    never additions to it — the fee columns in the database invite exactly
    //    that misreading and it overstates fees by about a third.
    autoTable(doc, {
        startY: 46,
        theme: 'plain',
        styles: { fontSize: 9.5, cellPadding: { top: 1.8, bottom: 1.8, left: 0, right: 0 }, textColor: INK },
        // Only the label column is pinned. Specifying BOTH widths means their sum
        // has to equal the available width exactly, and autotable warns on any
        // mismatch in either direction — jsPDF's A4 is 209.903mm, so that sum is
        // never a round number. Letting the last column take the remainder makes
        // the layout independent of the page and margin arithmetic.
        margin: { left: MARGIN, right: MARGIN },
        columnStyles: {
            0: { cellWidth: 117 },
            1: { halign: 'right', font: 'courier' },
        },
        body: [
            [{ content: 'Sales at list price', styles: { fontStyle: 'bold' } }, { content: amount(c.listPrice), styles: { fontStyle: 'bold' } }],
            ['   Less discounts you granted', amount(-c.discount)],
            [{ content: 'Net sales', styles: { fontStyle: 'bold' } }, { content: amount(c.revenue), styles: { fontStyle: 'bold' } }],
            ['', ''],
            ['   HangHut platform fee', amount(-c.platformFee)],
            ['   Payment processing (Xendit)', amount(-c.processingFee)],
            ['   Processing tax', amount(-c.processingTax)],
            [{ content: 'Total fees', styles: { fontStyle: 'bold' } }, { content: amount(-c.totalFees), styles: { fontStyle: 'bold' } }],
            // Payouts are whole pesos while fees carry centavos, so per-row
            // rounding accumulates — 130 rows of one real October came to
            // PHP 16.51. Without this line the columns visibly fail to
            // subtract, which on a financial document reads as an error.
            ...(Math.abs(c.residual) >= 0.01
                ? [[c.unreconciled > 0 ? '   Unexplained difference' : '   Rounding', amount(-c.residual)]]
                : []),
            ['', ''],
            [{ content: 'Net earned in period', styles: { fontStyle: 'bold', fontSize: 11 } }, { content: withCode(c.netPayout), styles: { fontStyle: 'bold', fontSize: 11 } }],
        ],
        didDrawPage: () => undefined,
    })

    let y = afterTable(doc, 46)

    // ── Context the waterfall above deliberately excludes.
    const notes: string[] = []
    if (b.buyerPaidFees > 0) {
        notes.push(`Your buyers covered ${withCode(b.buyerPaidFees)} of HangHut fees on your behalf. That is not a cost to you and is not in the fees above.`)
    }
    if (b.refunds.count > 0) {
        notes.push(`${b.refunds.count} refund${b.refunds.count === 1 ? '' : 's'} totalling ${withCode(Math.abs(b.refunds.amount))} are already netted into the figures above.`)
    }
    if (b.doorCollected > 0) {
        notes.push(`Door sales of ${withCode(b.doorCollected)} are excluded: you collected that cash yourself, HangHut never held it and charges nothing on it.`)
    }
    if (c.count > 0) {
        notes.push('The platform fee includes any per-ticket component; it is not charged twice.')
    }

    if (notes.length) {
        doc.setFontSize(8.5)
        doc.setTextColor(MUTED)
        for (const n of notes) {
            const lines = doc.splitTextToSize(n, PAGE_W - MARGIN * 2) as string[]
            doc.text(lines, MARGIN, y)
            y += lines.length * 3.9 + 1.6
        }
        y += 4
    }

    // ── By source. Only shown when more than one ledger has activity, so a
    //    tickets-only organizer is not handed two tables saying the same thing.
    const sources = [
        { label: 'Ticket sales', t: b.tickets },
        { label: 'Experiences', t: b.experiences },
        { label: 'Merchandise', t: b.merch },
    ].filter(s => s.t.count > 0)

    if (sources.length > 1) {
        autoTable(doc, {
            startY: y,
            theme: 'striped',
            margin: { left: MARGIN, right: MARGIN },
            headStyles: { fillColor: HEAD, textColor: '#FFFFFF', fontSize: 8.5 },
            styles: { fontSize: 8.5, textColor: INK },
            columnStyles: {
                1: { halign: 'right' }, 2: { halign: 'right', font: 'courier' },
                3: { halign: 'right', font: 'courier' }, 4: { halign: 'right', font: 'courier' },
            },
            head: [['By source', rightHead('Count'), rightHead('Net sales'), rightHead('Fees'), rightHead('Net earned')]],
            body: sources.map(s => [s.label, String(s.t.count), amount(s.t.revenue), amount(-s.t.totalFees), amount(s.t.netPayout)]),
        })
        y = afterTable(doc, y)
    }

    // ── By event. Skipped when the whole document IS one event: the table
    //    would restate the waterfall above it, row for row.
    if (!b.scope && b.byEvent.length > 0) {
        autoTable(doc, {
            startY: y,
            theme: 'striped',
            margin: { left: MARGIN, right: MARGIN },
            headStyles: { fillColor: HEAD, textColor: '#FFFFFF', fontSize: 8.5 },
            styles: { fontSize: 8.5, textColor: INK, overflow: 'linebreak' },
            columnStyles: {
                0: { cellWidth: 82 },
                1: { halign: 'right' }, 2: { halign: 'right', font: 'courier' },
                3: { halign: 'right', font: 'courier' }, 4: { halign: 'right', font: 'courier' },
            },
            head: [['Event', rightHead('Sales'), rightHead('Net sales'), rightHead('Fees'), rightHead('Net earned')]],
            body: b.byEvent.map(e => [e.title, String(e.count), amount(e.revenue), amount(-e.fees), amount(e.net)]),
        })
        y = afterTable(doc, y)
    }

    // ── Payouts. Reported, never reconciled against the sales above: a payout
    //    is a withdrawal from a running balance, not a batch of these sales.
    if (b.payouts.length > 0) {
        autoTable(doc, {
            startY: y,
            theme: 'striped',
            margin: { left: MARGIN, right: MARGIN },
            headStyles: { fillColor: HEAD, textColor: '#FFFFFF', fontSize: 8.5 },
            styles: { fontSize: 8.5, textColor: INK },
            columnStyles: { 4: { halign: 'right', font: 'courier' } },
            head: [['Payout requested', 'Settled', 'Destination', 'Status', rightHead('Amount')]],
            body: b.payouts.map(p => [
                p.requestedAt ? manilaDate(p.requestedAt) : '—',
                p.completedAt ? manilaDate(p.completedAt) : '—',
                [p.bankName, p.maskedAccount].filter(Boolean).join(' ') || '—',
                p.status.replace(/_/g, ' '),
                amount(p.amount),
            ]),
        })
        y = afterTable(doc, y)

        doc.setFontSize(8.5)
        doc.setTextColor(MUTED)
        const lines = doc.splitTextToSize(
            `Paid out in this period: ${withCode(b.paidOutInPeriod)}. A payout is a withdrawal against your running balance, so it will not equal the net earned above — it may release earnings from an earlier period, or leave some of this period's earnings to withdraw later.`,
            PAGE_W - MARGIN * 2,
        ) as string[]
        doc.text(lines, MARGIN, y)
        y += lines.length * 3.9 + 4
    }

    // ── A scoped statement has no payouts section at all. Saying so is the
    //    point: a reader who expects one must learn that none exists, rather
    //    than assume the event was never paid.
    if (b.scope) {
        doc.setFontSize(8.5)
        doc.setTextColor(MUTED)
        const lines = doc.splitTextToSize(
            'Payouts are not listed here. A payout is a withdrawal against your whole account balance rather than against one event, so no payout can be attributed to this event. See the account statement for the same period for what was withdrawn.',
            PAGE_W - MARGIN * 2,
        ) as string[]
        doc.text(lines, MARGIN, y)
        y += lines.length * 3.9 + 4
    }

    // ── Anything the fee model could not explain is stated, not absorbed.
    if (b.unreconciled > 0) {
        doc.setFontSize(8.5)
        doc.setTextColor('#B45309')
        const lines = doc.splitTextToSize(
            `${b.unreconciled} of ${c.count} transactions do not reconcile against the fee breakdown shown and are included at their recorded payout value. Contact support quoting this statement if the totals matter to your filing.`,
            PAGE_W - MARGIN * 2,
        ) as string[]
        doc.text(lines, MARGIN, y)
        y += lines.length * 3.9 + 4
    }

    if (b.truncated) {
        doc.setFontSize(8.5)
        doc.setTextColor('#B45309')
        doc.text('This period exceeded the export limit and is incomplete. Narrow the range.', MARGIN, y)
        y += 8
    }

    // ── The ledger. Its own page: the summary above is what most people read,
    //    and a transaction list that starts halfway down a page is harder to
    //    scan and to file. autotable repeats the header across page breaks.
    if (b.rows.length > 0) {
        doc.addPage()

        doc.setFontSize(13)
        doc.setTextColor(INK)
        doc.setFont('helvetica', 'bold')
        doc.text('Transactions', MARGIN, 20)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.5)
        doc.setTextColor(MUTED)
        doc.text(
            `${b.rows.length.toLocaleString()} transaction${b.rows.length === 1 ? '' : 's'} between `
            + `${plainDate(b.period.from)} and ${plainDate(b.period.to)}, newest first. `
            + 'Sales are net of discount; fees are the total deducted from each.',
            MARGIN, 26,
        )

        autoTable(doc, {
            startY: 31,
            theme: 'striped',
            margin: { left: MARGIN, right: MARGIN, top: 18 },
            // Keep a transaction whole. The default splits a tall row across the
            // break, which strands a wrapped event title at the top of the next
            // page with its date and amounts left behind on the previous one.
            rowPageBreak: 'avoid',
            headStyles: { fillColor: HEAD, textColor: '#FFFFFF', fontSize: 7.5 },
            styles: { fontSize: 7.5, textColor: INK, cellPadding: 1.6, overflow: 'linebreak' },
            columnStyles: {
                0: { cellWidth: 19 },
                1: { cellWidth: 16, font: 'courier' },
                2: { cellWidth: 52 },
                3: { cellWidth: 17 },
                4: { halign: 'right', font: 'courier' },
                5: { halign: 'right', font: 'courier' },
                6: { halign: 'right', font: 'courier' },
            },
            head: [['Date', 'Ref', 'Event', 'Method', rightHead('Sales'), rightHead('Fees'), rightHead('Net')]],
            body: b.rows.map(r => [
                manilaDate(r.date),
                r.id.slice(0, 8),
                // A refund reversal is a real ledger line; marking it beats a
                // reader wondering why a row carries negative figures.
                r.status === 'refunded' ? `${r.event}  (refund)` : r.event,
                r.method,
                amount(r.revenue),
                amount(-r.fees),
                amount(r.net),
            ]),
            // Rows the fee model cannot explain are flagged in place, so the
            // count in the summary can be traced to actual lines.
            didParseCell: (d) => {
                if (d.section === 'body' && b.rows[d.row.index]?.odd) {
                    d.cell.styles.textColor = '#B45309'
                }
            },
        })

        if (b.rows.some(r => r.odd)) {
            doc.setFontSize(7.5)
            doc.setTextColor('#B45309')
            doc.text('Amber rows do not reconcile against the fee breakdown and are shown at their recorded payout value.', MARGIN, afterTable(doc, 31))
        }
    } else if (b.detailOmitted) {
        doc.setFontSize(8.5)
        doc.setTextColor(MUTED)
        const lines = doc.splitTextToSize(
            'Line-by-line detail is omitted: this period holds too many transactions to list legibly. Narrow the range, or use the CSV export on the Transactions tab for the full ledger.',
            PAGE_W - MARGIN * 2,
        ) as string[]
        doc.text(lines, MARGIN, y)
    }

    footer(
        doc,
        'HangHut statement. Figures in Philippine pesos (PHP). Not a tax invoice.',
        `${plainDate(b.period.from)} – ${plainDate(b.period.to)}`,
    )
    return doc
}

export function statementFilename(b: StatementBundle): string {
    if (b.scope) {
        // Filed alongside other events' statements for the same month, so the
        // event has to be in the name, not just the dates.
        const slug = b.scope.eventTitle
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
            || 'event'
        return `hanghut-${slug}-${b.period.from}_${b.period.to}.pdf`
    }
    return `hanghut-statement-${b.period.from}_${b.period.to}.pdf`
}

/* ─────────────────────────── Advice ─────────────────────────── */

/**
 * One disbursement, for the organizer to file or forward as proof of receipt.
 * Deliberately not itemised: see payout-statement-actions for why no honest
 * itemisation exists.
 */
export function buildAdvicePdf(b: AdviceBundle): Doc {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' }) as Doc
    const p = b.payout

    heading(doc, b, 'Payout advice', `Reference ${p.reference || p.id.slice(0, 8)}`)

    doc.setFontSize(9)
    doc.setTextColor(MUTED)
    doc.text('Amount disbursed', MARGIN, 52)
    doc.setFontSize(22)
    doc.setTextColor(INK)
    doc.setFont('helvetica', 'bold')
    doc.text(withCode(p.amount), MARGIN, 62)
    doc.setFont('helvetica', 'normal')

    autoTable(doc, {
        startY: 72,
        theme: 'plain',
        styles: { fontSize: 9.5, cellPadding: { top: 2, bottom: 2, left: 0, right: 0 }, textColor: INK },
        margin: { left: MARGIN, right: MARGIN },
        columnStyles: { 0: { cellWidth: 52, textColor: MUTED } },
        body: [
            ['Status', p.status.replace(/_/g, ' ')],
            ['Requested', p.requestedAt ? manilaDateTime(p.requestedAt) : '—'],
            ['Settled', p.completedAt ? manilaDateTime(p.completedAt) : 'Not yet settled'],
            ['Bank', p.bankName || '—'],
            ['Account', p.maskedAccount || '—'],
            ['Gateway reference', p.reference || '—'],
            ['Payout ID', p.id],
        ],
    })

    const y = afterTable(doc, 72)
    doc.setFontSize(8.5)
    doc.setTextColor(MUTED)
    const lines = doc.splitTextToSize(
        'This advice confirms one transfer. It is not itemised by sale: a payout is a withdrawal against your running balance rather than a batch of specific transactions. For sales and fees over a date range, use the payout statement.',
        PAGE_W - MARGIN * 2,
    ) as string[]
    doc.text(lines, MARGIN, y)

    footer(doc, 'HangHut payout advice. Figures in Philippine pesos (PHP). Not a tax invoice.')
    return doc
}

export function adviceFilename(b: AdviceBundle): string {
    const d = b.payout.completedAt || b.payout.requestedAt || b.generatedAt
    return `hanghut-payout-advice-${d.slice(0, 10)}-${b.payout.id.slice(0, 8)}.pdf`
}
