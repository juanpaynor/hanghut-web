/**
 * The canonical fee waterfall. One definition, used by every surface that
 * shows an organizer what they earned: the payouts page, the transactions
 * CSV, the statement PDF and the payout advice.
 *
 * ── Why this file exists ──────────────────────────────────────────────
 *
 * `transactions` carries four fee-shaped columns — platform_fee, fixed_fee,
 * payment_processing_fee, vat — and they look like a waterfall. They are not.
 * Summing them against prod (1,213 completed rows) gives ₱116,735 of fees
 * where the organizers were actually deducted ₱88,187. That is 32% too high,
 * and only 7 of 1,213 rows reconcile.
 *
 * Two traps account for the gap:
 *
 *  1. `fixed_fee` is a COMPONENT of `platform_fee`, not an extra charge.
 *     create-purchase-intent builds the take as `pctTake + fixedTake` and
 *     stores that sum as platform_fee. Adding fixed_fee again double-counts
 *     it — ₱28,590 of double-count across the table.
 *
 *  2. `gross_amount` is the PRE-DISCOUNT list price, while organizer_payout
 *     is derived from what the buyer actually paid. The discount lives on
 *     purchase_intents, not on the transaction, so a transactions-only query
 *     cannot reconcile a discounted sale. 60 rows, ₱5,530.
 *
 * Correcting both takes the fit from 7 rows to 1,201 of 1,213 (99.0%).
 *
 * ── The waterfall ─────────────────────────────────────────────────────
 *
 *   list price            gross_amount          (price × qty, before discount)
 *   − discount            purchase_intents.discount_amount  (promo + subscriber)
 *   = revenue                                   what the buyer was charged for the goods
 *   − platform fee        platform_fee          HangHut's take, ONLY the part the
 *                                               organizer absorbed — it is 0 when the
 *                                               organizer passed the fee to the buyer
 *   − processing          payment_processing_fee  Xendit
 *   − processing tax      vat                     Xendit per-transaction tax (~₱2/ticket)
 *   = net payout          organizer_payout
 *
 * `fixed_fee` is reported as a breakdown DETAIL of the platform fee and is
 * never added to the total. Nor is `fee_percentage`, which is a rate.
 *
 * ── What this file deliberately does not do ───────────────────────────
 *
 * It does not reconcile a PAYOUT. A payout is a withdrawal against a running
 * balance that spans three ledgers plus refunds, not a batch of sales, so
 * `transactions.payout_id` does not foot — every completed payout on prod
 * disagrees with the sum of its linked rows, by −₱725 to +₱1,619. Statements
 * must therefore be built over a PERIOD, which does foot, and a payout advice
 * must report the disbursement alone. See the payout statement actions.
 */

/** Smallest meaningful money difference. Payouts are whole pesos while the
 *  processing fee carries centavos, so a correct row can still be half a peso
 *  out from the rounding alone. */
const RECONCILE_TOLERANCE = 0.51

/**
 * One row's inputs, named exactly as the database names them so a caller can
 * hand over a select result without renaming and getting it subtly wrong.
 *
 * Only `gross_amount` and `organizer_payout` are required: the experiences
 * ledger has no processing fee and the merch ledger has no vat, and a missing
 * column must read as "this ledger does not charge it", not as a zero that
 * silently breaks the reconciliation.
 */
export type FeeRow = {
    gross_amount: number | string
    organizer_payout: number | string
    /** HangHut's take that the ORGANIZER absorbed. Zero when passed to the buyer. */
    platform_fee?: number | string | null
    /** The fixed (per-ticket) component of platform_fee. Detail only — never added. */
    fixed_fee?: number | string | null
    payment_processing_fee?: number | string | null
    /** Xendit's per-transaction tax. Grouped with processing on any statement. */
    vat?: number | string | null
    /** From purchase_intents, NOT from the transaction. Omitting it on a
     *  discounted sale is the single most common way to produce a statement
     *  that does not foot. */
    discount_amount?: number | string | null
}

export type FeeBreakdown = {
    /** Price × quantity, before any discount. Not revenue — do not label it so. */
    listPrice: number
    /** Promo and subscriber discounts the organizer granted. */
    discount: number
    /** What the buyer was charged for the goods: listPrice − discount. */
    revenue: number
    /** HangHut's take, organizer-absorbed portion only. */
    platformFee: number
    /** The per-ticket component inside platformFee. Shown as a detail line. */
    platformFeeFixedPortion: number
    /** Xendit's percentage/fixed charge. */
    processingFee: number
    /** Xendit's per-transaction tax. */
    processingTax: number
    /** platformFee + processingFee + processingTax. Excludes the discount,
     *  which is forgone revenue rather than a fee charged to the organizer. */
    totalFees: number
    /** What the organizer actually receives. */
    netPayout: number
    /** revenue − totalFees − netPayout. Non-zero means the row does not foot. */
    residual: number
    /** False when the row cannot be explained by the model. A statement must
     *  surface these rather than quietly absorbing them into a total. */
    reconciles: boolean
}

/** Postgres numerics arrive as strings over PostgREST. A bare Number() on null
 *  gives 0, which is right here, but on undefined gives NaN, which is not. */
function num(v: number | string | null | undefined): number {
    if (v === null || v === undefined || v === '') return 0
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}

export function computeFees(row: FeeRow): FeeBreakdown {
    const listPrice = num(row.gross_amount)
    const discount = num(row.discount_amount)
    const revenue = listPrice - discount

    const platformFee = num(row.platform_fee)
    const platformFeeFixedPortion = num(row.fixed_fee)
    const processingFee = num(row.payment_processing_fee)
    const processingTax = num(row.vat)

    const totalFees = platformFee + processingFee + processingTax
    const netPayout = num(row.organizer_payout)

    const residual = revenue - totalFees - netPayout

    return {
        listPrice,
        discount,
        revenue,
        platformFee,
        platformFeeFixedPortion,
        processingFee,
        processingTax,
        totalFees,
        netPayout,
        residual,
        reconciles: Math.abs(residual) <= RECONCILE_TOLERANCE,
    }
}

export type FeeTotals = FeeBreakdown & {
    /** How many rows went into these totals. */
    count: number
    /** How many of them could not be explained by the model. */
    unreconciled: number
}

/**
 * Sum a set of rows. Totals are summed from the per-row figures rather than
 * recomputed from summed inputs, so one unexplained row cannot quietly shift
 * the whole statement — it shows up in `unreconciled` instead.
 */
export function sumFees(rows: FeeRow[]): FeeTotals {
    const zero: FeeTotals = {
        listPrice: 0, discount: 0, revenue: 0,
        platformFee: 0, platformFeeFixedPortion: 0,
        processingFee: 0, processingTax: 0,
        totalFees: 0, netPayout: 0, residual: 0,
        reconciles: true, count: 0, unreconciled: 0,
    }

    const t = rows.reduce<FeeTotals>((acc, row) => {
        const f = computeFees(row)
        acc.listPrice += f.listPrice
        acc.discount += f.discount
        acc.revenue += f.revenue
        acc.platformFee += f.platformFee
        acc.platformFeeFixedPortion += f.platformFeeFixedPortion
        acc.processingFee += f.processingFee
        acc.processingTax += f.processingTax
        acc.totalFees += f.totalFees
        acc.netPayout += f.netPayout
        acc.residual += f.residual
        acc.count += 1
        if (!f.reconciles) acc.unreconciled += 1
        return acc
    }, zero)

    t.reconciles = t.unreconciled === 0
    return t
}

/**
 * The columns every fee calculation needs from `transactions`, including the
 * purchase_intents join that carries the discount. Callers that build their
 * own select will reconcile correctly for undiscounted sales and silently
 * wrongly for the rest, so they should use this instead.
 */
export const TICKET_FEE_SELECT = `
    gross_amount,
    platform_fee,
    fixed_fee,
    payment_processing_fee,
    vat,
    organizer_payout,
    purchase_intent:purchase_intents ( discount_amount )
` as const

/** PostgREST returns an embedded one-to-one as an object, or as a single-element
 *  array depending on how the relationship is inferred. Flatten before reading. */
export function withIntentDiscount<T extends Record<string, unknown>>(
    row: T & { purchase_intent?: { discount_amount?: number | string | null } | { discount_amount?: number | string | null }[] | null },
): T & { discount_amount: number } {
    const pi = Array.isArray(row.purchase_intent) ? row.purchase_intent[0] : row.purchase_intent
    return { ...row, discount_amount: num(pi?.discount_amount) }
}
