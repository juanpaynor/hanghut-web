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
 * Add business days (Mon-Fri) to a date, skipping weekends.
 */
export function addBusinessDays(date: Date, days: number): Date {
    const result = new Date(date)
    let added = 0
    
    while (added < days) {
        result.setDate(result.getDate() + 1)
        const dayOfWeek = result.getDay()
        // Skip Saturday (6) and Sunday (0)
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
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

/**
 * Calculate settlement status and ETA for a transaction.
 */
export function getSettlementInfo(createdAt: string, paymentMethod: string | null | undefined): {
    status: 'settled' | 'pending'
    etaDate: Date
    etaLabel: string
} {
    const paymentDate = new Date(createdAt)
    const days = getSettlementDays(paymentMethod)
    const etaDate = addBusinessDays(paymentDate, days)
    const now = new Date()
    
    const isSettled = now >= etaDate
    
    return {
        status: isSettled ? 'settled' : 'pending',
        etaDate,
        etaLabel: isSettled ? 'Settled' : `Pending`,
    }
}
