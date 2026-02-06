import { BankCode } from '@/lib/constants/banks'

if (!process.env.XENDIT_SECRET_KEY) {
    console.error('Missing XENDIT_SECRET_KEY environment variable')
}

interface XenditPayoutParams {
    externalId: string
    amount: number
    email?: string
    bankCode: BankCode
    accountNumber: string
    accountHolderName: string
    description?: string
}

interface XenditPayoutResponse {
    id: string
    external_id: string
    amount: number
    status: 'ISSUED' | 'DISBURSED' | 'FAILED'
    merchant_name: string
    channel_code: string
    bank_code: string // legacy
    account_holder_name: string
    account_number: string
    description: string
    created: string
    updated: string
    currency: string
}

export async function executeXenditPayout(params: XenditPayoutParams): Promise<{ success: boolean; data?: any; error?: string }> {
    const apiKey = process.env.XENDIT_SECRET_KEY
    if (!apiKey) {
        return { success: false, error: 'Payment service not configured (Missing API Key)' }
    }

    try {
        console.log('[Xendit] Initiating Payout:', { ...params, accountHolderName: '***' })

        // Xendit Payouts V2 Endpoint
        // https://developers.xendit.co/api-reference/#payouts
        const response = await fetch('https://api.xendit.co/v2/payouts', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
                'Content-Type': 'application/json',
                'Idempotency-Key': params.externalId // Use external ID as idempotency key or separate unique logic
            },
            body: JSON.stringify({
                external_id: params.externalId,
                amount: params.amount,
                channel_code: params.bankCode,
                account_holder_name: params.accountHolderName,
                account_number: params.accountNumber,
                description: params.description || `Payout ref ${params.externalId}`,
                currency: 'PHP',
                email: params.email
            })
        })

        const data: XenditPayoutResponse = await response.json()

        if (!response.ok) {
            console.error('[Xendit] Payout Failed:', data)
            return {
                success: false,
                error: (data as any).message || (data as any).error_code || 'Xendit API Validation Error',
                data
            }
        }

        console.log('[Xendit] Payout Created Successfully:', data.id, data.status)
        return { success: true, data }

    } catch (error: any) {
        console.error('[Xendit] Exception during payout:', error)
        return { success: false, error: error.message || 'Network error communicating with Xendit' }
    }
}
