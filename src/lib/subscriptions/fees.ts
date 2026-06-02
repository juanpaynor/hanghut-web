/**
 * Returns HangHut's platform fee rate for subscription revenue.
 * Evaluated per partner, per calendar month.
 *
 * Payrex processing (~3%) is absorbed by the partner — deducted from
 * their payout, never added to the fan's checkout total.
 */
export function getPlatformFeeRate(hostMonthlyRevenue: number): number {
    if (hostMonthlyRevenue <= 5000) return 0.10
    if (hostMonthlyRevenue <= 20000) return 0.08
    if (hostMonthlyRevenue <= 50000) return 0.06
    return 0.05
}

/**
 * Calculates the platform fee for a single subscription payment,
 * given the partner's total revenue so far this calendar month.
 */
export function calculatePlatformFee(amount: number, hostMonthlyRevenueSoFar: number): number {
    const rate = getPlatformFeeRate(hostMonthlyRevenueSoFar + amount)
    return Math.round(amount * rate * 100) / 100
}
