import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { payout_id } = await req.json()

        if (!payout_id) {
            throw new Error('Missing payout_id')
        }

        // 1. Initialize Supabase Client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseKey)
        const resendApiKey = Deno.env.get('RESEND_API_KEY')!


        // 2. Validate Admin User (Caller)
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) throw new Error('Missing Authorization header')

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: userError } = await supabase.auth.getUser(token)

        if (userError || !user) throw new Error('Unauthorized')

        // Check is_admin flag
        const { data: adminData, error: adminError } = await supabase
            .from('users')
            .select('is_admin')
            .eq('id', user.id)
            .single()

        if (adminError || adminData?.is_admin !== true) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized: Admin privileges required' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 3. Fetch Payout & Partner (including xendit_account_id)
        const { data: payout, error: payoutError } = await supabase
            .from('payouts')
            .select(`
                *,
                partners (
                    business_name,
                    xendit_account_id,
                    use_main_wallet
                )
            `)
            .eq('id', payout_id)
            .single()

        if (payoutError || !payout) throw new Error('Payout not found')

        if (payout.status !== 'pending_request') {
            throw new Error(`Payout is not pending (Status: ${payout.status})`)
        }

        // 4. Lock the record (optimistic concurrency) so two admins can't double-disburse.
        //    This is a transient lock while we call Xendit — the resting state after a
        //    successful disbursement is 'approved' (set in step 6).
        const { error: updateError } = await supabase
            .from('payouts')
            .update({
                status: 'processing',
                approved_by: user.id,
                approved_at: new Date().toISOString()
            })
            .eq('id', payout_id)
            .eq('status', 'pending_request') // Optimistic Concurrency Control

        if (updateError) throw new Error('Failed to lock payout record. Try again.')

        // Helper: revert a failed/errored disbursement so the funds are freed again.
        const revertToFailed = async (note: string) => {
            await supabase.from('payouts').update({ status: 'failed', admin_notes: note }).eq('id', payout_id)
            await supabase.from('transactions').update({ payout_id: null }).eq('payout_id', payout_id)
            await supabase.from('experience_transactions').update({ payout_id: null }).eq('payout_id', payout_id)
        }

        // 5. Execute Xendit Payout
        const xenditSecret = Deno.env.get('XENDIT_SECRET_KEY')
        if (!xenditSecret) throw new Error('Missing XENDIT_SECRET_KEY')

        // Build headers — include for-user-id to disburse from partner's sub-wallet
        const xenditHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${btoa(xenditSecret + ':')}`,
            'Idempotency-key': payout.id
        }

        const partnerXenditAccountId = payout.partners?.xendit_account_id
        if (partnerXenditAccountId) {
            xenditHeaders['for-user-id'] = partnerXenditAccountId
            console.log(`Using partner sub-account: ${partnerXenditAccountId}`)
        } else {
            console.warn(`No xendit_account_id for partner — disbursing from main account`)
        }

        let response: Response
        let xenditData: any
        try {
            response = await fetch('https://api.xendit.co/v2/payouts', {
                method: 'POST',
                headers: xenditHeaders,
                body: JSON.stringify({
                    reference_id: payout.id,
                    channel_code: payout.bank_name,
                    channel_properties: {
                        account_holder_name: payout.bank_account_name,
                        account_number: payout.bank_account_number
                    },
                    amount: payout.amount,
                    currency: 'PHP',
                    description: `Payout for ${payout.partners?.business_name}`
                })
            })
            xenditData = await response.json()
        } catch (fetchErr) {
            // Network / parse error — never leave the payout stuck locked.
            await revertToFailed(`Xendit request error: ${fetchErr.message}`)
            throw new Error(`Failed to reach payment provider: ${fetchErr.message}`)
        }

        console.log('Xendit response:', JSON.stringify(xenditData))

        if (!response.ok) {
            // Revert status to failed if Xendit rejects the request
            await revertToFailed(`Xendit Error: ${xenditData.message}`)
            console.log(`Transactions unlinked from failed payout ${payout_id}`)
            throw new Error(`Xendit Error: ${xenditData.message || JSON.stringify(xenditData)}`)
        }

        // 6. Mark APPROVED + save external IDs. The disbursement has been accepted by
        //    Xendit, so we rest at 'approved' — no separate 'processing' → 'completed'
        //    lifecycle to get stuck on.
        await supabase.from('payouts').update({
            status: 'approved',
            xendit_external_id: xenditData.reference_id,
            xendit_disbursement_id: xenditData.id
        }).eq('id', payout_id)


        // 7. Send Notification Email (Resend)
        try {
            const { data: partnerRecord } = await supabase
                .from('partners')
                .select('user_id')
                .eq('id', payout.partner_id)
                .single();

            if (partnerRecord) {
                const { data: userRecord } = await supabase
                    .from('users')
                    .select('email')
                    .eq('id', partnerRecord.user_id)
                    .single();

                if (userRecord?.email) {
                    const emailRes = await fetch('https://api.resend.com/emails', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${resendApiKey}`
                        },
                        body: JSON.stringify({
                            from: 'Hanghut Payout <payout@hanghut.com>',
                            to: [userRecord.email],
                            subject: 'Payout Approved',
                            html: `
                                <h1>Payout Approved</h1>
                                <p>Your payout request for <strong>PHP ${payout.amount}</strong> has been approved and sent to your bank / e-wallet.</p>
                                <p>Reference ID: ${payout.id}</p>
                                <p>Estimated arrival: Instant (or within 1 business day)</p>
                            `
                        })
                    })
                    if (!emailRes.ok) {
                        const err = await emailRes.text()
                        console.error('Email failed:', err)
                    }
                }
            }

        } catch (emailErr) {
            console.error('Failed to send email (non-blocking):', emailErr)
        }

        return new Response(
            JSON.stringify({ success: true, status: 'approved', xendit_id: xenditData.id }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
