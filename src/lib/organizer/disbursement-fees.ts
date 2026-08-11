/**
 * Xendit disbursement (payout) transfer fees — charged to the ORGANIZER's wallet
 * on top of the refund amount when a refund is sent via a Direct Disbursement
 * (the QRPH / bank-transfer refund path), NOT a Refund-API reversal.
 *
 * Channels are the SAME Xendit channel codes the payout tab uses (PHILIPPINE_BANKS),
 * so a refund can be sent to any bank or e-wallet Xendit supports. Fees are
 * per-Xendit-contract and can change; e-wallet/InstaPay is ₱10 on the current
 * invoice, PESONet (banks) can run higher — we disclose a safe estimate and the
 * edge function holds the authoritative copy for the wallet balance check.
 *
 * IMPORTANT: this is the FRONTEND estimate used only to disclose the fee in the
 * refund modal. `create-disbursement` holds the authoritative fee and is what
 * actually gates the balance check (amount + fee).
 */

/** e-wallet channel codes (payout via InstaPay-class rails, flat low fee). */
export const EWALLET_CHANNELS = new Set(['PH_GCASH', 'PH_PAYMAYA', 'PH_GRABPAY', 'PH_COINS'])

const EWALLET_FEE = 10 // ₱ — matches the current Xendit invoice line
const BANK_FEE = 15    // ₱ — safe upper estimate (PESONet can exceed InstaPay)

/** True when the channel is an e-wallet (account_number is a mobile number). */
export function isEwalletChannel(channel: string | null | undefined): boolean {
    return !!channel && EWALLET_CHANNELS.has(channel)
}

/** Estimated transfer fee for a channel (₱). */
export function disbursementFee(channel: string | null | undefined): number {
    return isEwalletChannel(channel) ? EWALLET_FEE : BANK_FEE
}
