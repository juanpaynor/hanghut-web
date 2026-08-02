/**
 * Xendit Philippines Settlement Calculator
 * 
 * Settlement timelines by payment method (working days):
 * - eWallet (GCash, Maya, GrabPay, ShopeePay): T+2
 * - QRPH: T+1
 * - Credit/Debit Card: T+5
 * - Direct Debit: T+1
 * - Over-the-Counter: T+3
 * - Bank Transfer: T+2
 */

const SETTLEMENT_DAYS: Record<string, number> = {
    // eWallets
    'gcash': 2,
    'grabpay': 2,
    'shopeepay': 2,
    'maya': 2,
    'paymaya': 2,
    
    // QR
    'qrph': 1,
    'qr_code': 1,
    
    // Cards
    'credit_card': 5,
    'debit_card': 5,
    'card': 5,
    
    // Direct Debit
    'direct_debit': 1,
    'bpi': 1,
    'ubp': 1,
    
    // Bank Transfer / Virtual Account
    'bank_transfer': 2,
    'virtual_account': 2,
    
    // OTC
    'otc': 3,
    'over_the_counter': 3,
    '7eleven': 3,
    'cebuana': 3,
}

const DEFAULT_SETTLEMENT_DAYS = 2

/**
 * PH bank holidays (no settlement on these) — best-effort list, UPDATE YEARLY.
 * Xendit settles on banking days, so weekends AND these are skipped. This only
 * improves the ESTIMATE; the real ETA comes from Xendit (see estimated flag).
 */
const PH_BANK_HOLIDAYS = new Set<string>([
    // 2026 regular holidays
    '2026-01-01', '2026-04-02', '2026-04-03', '2026-04-09', '2026-05-01',
    '2026-06-12', '2026-08-31', '2026-11-30', '2026-12-25', '2026-12-30',
    // 2026 common special non-working days (banks usually closed)
    '2026-02-25', '2026-08-21', '2026-11-01', '2026-12-08', '2026-12-31',
])

function isoDay(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Add business days, skipping weekends AND PH bank holidays.
 */
export function addBusinessDays(date: Date, days: number): Date {
    const result = new Date(date)
    let added = 0

    while (added < days) {
        result.setDate(result.getDate() + 1)
        const dayOfWeek = result.getDay()
        // Skip Saturday (6), Sunday (0) and bank holidays
        if (dayOfWeek !== 0 && dayOfWeek !== 6 && !PH_BANK_HOLIDAYS.has(isoDay(result))) {
            added++
        }
    }

    return result
}

/**
 * Get the number of settlement days for a payment method.
 */
export function getSettlementDays(paymentMethod: string | null | undefined): number {
    if (!paymentMethod) return DEFAULT_SETTLEMENT_DAYS
    
    const normalized = paymentMethod.toLowerCase().replace(/\s+/g, '_')
    return SETTLEMENT_DAYS[normalized] ?? DEFAULT_SETTLEMENT_DAYS
}

/**
 * Get the settlement channel category for display.
 */
export function getPaymentChannel(paymentMethod: string | null | undefined): string {
    if (!paymentMethod) return 'Unknown'
    
    const normalized = paymentMethod.toLowerCase()
    
    if (['gcash', 'grabpay', 'shopeepay', 'maya', 'paymaya'].includes(normalized)) {
        return 'eWallet'
    }
    if (['qrph', 'qr_code'].includes(normalized)) {
        return 'QR Code'
    }
    if (['credit_card', 'debit_card', 'card'].includes(normalized)) {
        return 'Card'
    }
    if (['direct_debit', 'bpi', 'ubp'].includes(normalized)) {
        return 'Direct Debit'
    }
    if (['bank_transfer', 'virtual_account'].includes(normalized)) {
        return 'Bank Transfer'
    }
    if (['otc', 'over_the_counter', '7eleven', 'cebuana'].includes(normalized)) {
        return 'OTC'
    }
    
    return paymentMethod.toUpperCase()
}

/** Real settlement data from Xendit, when we've synced it onto the transaction. */
export interface RealSettlement {
    /** Xendit settlement_status, e.g. 'SETTLED' | 'PENDING' (case-insensitive) */
    status?: string | null
    /** Xendit estimated_settlement_time (ISO) */
    etaTime?: string | null
    /** When it actually settled (ISO), if known */
    settledAt?: string | null
}

export interface SettlementInfo {
    status: 'settled' | 'pending'
    etaDate: Date
    etaLabel: string
    /** TRUE when this is our T+N guess, not Xendit's real status. Never show a
     *  confident "Settled" when estimated — the guess can (and does) drift. */
    estimated: boolean
}

/**
 * Settlement status + ETA for a transaction.
 *
 * Prefers Xendit's REAL settlement data when provided; otherwise falls back to a
 * T+N business-day ESTIMATE (holiday-aware, with a 1-day safety buffer so it
 * leans late rather than falsely early) and flags `estimated: true` so the UI
 * never presents a guess as a confirmed settlement.
 */
export function getSettlementInfo(
    createdAt: string,
    paymentMethod: string | null | undefined,
    real?: RealSettlement,
): SettlementInfo {
    // 1) Real data wins — this is Xendit's truth. Xendit settlement_status is
    //    PENDING | EARLY_SETTLED | SETTLED — the latter two both mean "in balance".
    const realStatus = real?.status?.toLowerCase()
    if (realStatus === 'settled' || realStatus === 'early_settled' || real?.settledAt) {
        const when = real?.settledAt ? new Date(real.settledAt) : (real?.etaTime ? new Date(real.etaTime) : new Date(createdAt))
        return { status: 'settled', etaDate: when, etaLabel: 'Settled', estimated: false }
    }
    if (realStatus === 'pending' || real?.etaTime) {
        const eta = real?.etaTime ? new Date(real.etaTime) : addBusinessDays(new Date(createdAt), getSettlementDays(paymentMethod))
        return { status: 'pending', etaDate: eta, etaLabel: 'Pending', estimated: false }
    }

    // 2) No real data yet → conservative estimate, clearly flagged.
    const paymentDate = new Date(createdAt)
    const days = getSettlementDays(paymentMethod)
    const etaDate = addBusinessDays(paymentDate, days)
    // +1 business-day buffer: only call it (est.) settled once we're safely past
    // the ETA, since flipping early is the misleading direction.
    const safeSettledDate = addBusinessDays(etaDate, 1)
    const isSettled = new Date() >= safeSettledDate

    return {
        status: isSettled ? 'settled' : 'pending',
        etaDate,
        etaLabel: isSettled ? 'Est. settled' : 'Pending',
        estimated: true,
    }
}
