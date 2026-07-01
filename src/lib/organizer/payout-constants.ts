/**
 * Payouts at or below this amount (PHP) are submitted directly; payouts ABOVE it
 * require an email OTP confirmation before any funds move. Shared by the server
 * action (enforcement) and the request card (UI flow) so the two never disagree.
 */
export const PAYOUT_OTP_THRESHOLD = 10000

/**
 * Xendit disbursement fee (Philippines) — a FIXED ₱10 per payout for both banks
 * and e-wallets, plus 12% VAT. Charged ON TOP of the requested amount and debited
 * from the organizer's wallet (the customer/org receives the full requested amount).
 * Shared by the payout card (disclosure + max), the server action, and the edge fn.
 */
export const DISBURSEMENT_FEE_PHP = 10
export const DISBURSEMENT_VAT_RATE = 0.12
/** Total debited on top of the amount: ₱10 + 12% VAT = ₱11.20. */
export const DISBURSEMENT_FEE_TOTAL = +(DISBURSEMENT_FEE_PHP * (1 + DISBURSEMENT_VAT_RATE)).toFixed(2)
export const DISBURSEMENT_VAT_AMOUNT = +(DISBURSEMENT_FEE_PHP * DISBURSEMENT_VAT_RATE).toFixed(2)
