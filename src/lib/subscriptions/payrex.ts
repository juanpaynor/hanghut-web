/**
 * Mock Payrex client for Phase 1.
 *
 * Auto-approves all payments and returns a fake reference.
 * When real Payrex is integrated, swap the implementation here —
 * the interface stays the same so nothing else changes.
 */

export interface PayrexCheckoutResult {
    payrex_ref: string
    checkout_url: string
    status: 'pending' | 'paid' | 'failed'
}

export interface PayrexWebhookPayload {
    payrex_ref: string
    status: 'paid' | 'failed'
    amount: number
    metadata: Record<string, string>
}

export const payrex = {
    /**
     * Creates a checkout session for a subscription payment.
     * Mock: immediately returns a fake paid reference.
     */
    async createCheckout(params: {
        amount: number
        description: string
        successUrl: string
        failureUrl: string
        metadata: Record<string, string>
    }): Promise<PayrexCheckoutResult> {
        const fakeRef = `mock_pr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

        // Mock: auto-redirect to success URL
        return {
            payrex_ref: fakeRef,
            checkout_url: `${params.successUrl}?payrex_ref=${fakeRef}&mock=1`,
            status: 'paid',
        }
    },

    /**
     * Verifies a webhook signature.
     * Mock: always returns true.
     */
    verifyWebhookSignature(_payload: string, _signature: string): boolean {
        return true
    },
}
