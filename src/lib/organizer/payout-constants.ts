/**
 * Payouts at or below this amount (PHP) are submitted directly; payouts ABOVE it
 * require an email OTP confirmation before any funds move. Shared by the server
 * action (enforcement) and the request card (UI flow) so the two never disagree.
 */
export const PAYOUT_OTP_THRESHOLD = 10000
