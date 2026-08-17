import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * create-xendit-subaccount
 *
 * NOTE: this file was recovered from the DEPLOYED copy (v21, deployed 2026-03-26) —
 * it had no source in this repo, which meant nobody could review what it sends to
 * Xendit before invoking it. Kept byte-identical to what is live; do not "tidy" it
 * without redeploying, or the repo and prod drift again.
 *
 * It only ever writes partners.xendit_account_id. It deliberately does NOT touch
 * use_main_wallet — having a sub-account and settling through it are separate
 * decisions (create-purchase-intent routes on use_main_wallet, not on the presence
 * of an account id).
 *
 * submit-xendit-kyc now performs this same POST /v2/accounts inline when a partner
 * has no sub-account, so this function is no longer the only path to one.
 */

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Validate Env Vars
        const sbUrl = Deno.env.get('SUPABASE_URL')
        const sbAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
        const sbServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
        const xenditKey = Deno.env.get('XENDIT_SECRET_KEY')

        if (!sbUrl) throw new Error('Missing SUPABASE_URL')
        if (!sbAnonKey) throw new Error('Missing SUPABASE_ANON_KEY')
        if (!sbServiceKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
        if (!xenditKey) throw new Error('Missing XENDIT_SECRET_KEY')

        // Auth client (verifies caller is admin or the partner's own user)
        const supabaseClient = createClient(
            sbUrl,
            sbAnonKey,
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        // Admin client for writing back the xendit_account_id
        const supabaseAdmin = createClient(sbUrl, sbServiceKey)

        // Get current user
        const { data: { user } } = await supabaseClient.auth.getUser()

        if (!user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            })
        }

        const { partner_id } = await req.json()

        if (!partner_id) {
            return new Response(JSON.stringify({ error: 'Missing partner_id' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        // 1. Fetch the partner record
        const { data: partner, error: partnerError } = await supabaseAdmin
            .from('partners')
            .select('id, user_id, business_name, work_email, xendit_account_id, status')
            .eq('id', partner_id)
            .single()

        if (partnerError || !partner) {
            return new Response(JSON.stringify({ error: 'Partner not found' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 404,
            })
        }

        // 2. Authorization: Only admin or the partner's own user can create sub-account
        //    Check JWT metadata first, then fall back to DB lookup (web admin panel uses authenticated JWT)
        let isAdmin = user.app_metadata?.role === 'admin' ||
                        user.app_metadata?.role === 'service_role' ||
                        user.user_metadata?.is_admin === true

        if (!isAdmin) {
            // Fallback: check users table for is_admin column (used by web admin panel)
            const { data: dbUser } = await supabaseAdmin
                .from('users')
                .select('is_admin')
                .eq('id', user.id)
                .single()
            if (dbUser?.is_admin === true) isAdmin = true
        }

        const isOwner = partner.user_id === user.id

        if (!isAdmin && !isOwner) {
            return new Response(JSON.stringify({ error: 'Unauthorized: Only admin or partner owner can create sub-account' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 403,
            })
        }

        // 3. Check if sub-account already exists
        if (partner.xendit_account_id) {
            console.log(`⚠️ Partner ${partner_id} already has xendit_account_id: ${partner.xendit_account_id}`)
            return new Response(JSON.stringify({
                success: true,
                message: 'Sub-account already exists',
                xendit_account_id: partner.xendit_account_id,
                already_existed: true,
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // 4. Create Xendit Sub-Account
        const authHeader = `Basic ${btoa(xenditKey + ':')}`
        const email = partner.work_email || user.email || `partner-${partner_id}@hanghut.com`

        const xenditPayload = {
            email: email,
            type: 'OWNED',
            public_profile: {
                business_name: partner.business_name || `HangHut Partner ${partner_id.substring(0, 8)}`,
            },
        }

        console.log(`🏦 Creating Xendit sub-account for partner ${partner_id}:`, xenditPayload)

        const xenditResponse = await fetch('https://api.xendit.co/v2/accounts', {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(xenditPayload),
        })

        const xenditData = await xenditResponse.json()

        if (!xenditResponse.ok) {
            console.error('❌ Xendit Create Account Error:', xenditData)

            // Handle duplicate email — Xendit may reject if email already used
            if (xenditData.error_code === 'DUPLICATE_ACCOUNT_ERROR' || xenditResponse.status === 409) {
                return new Response(JSON.stringify({
                    error: 'A Xendit account with this email already exists',
                    code: 'DUPLICATE_EMAIL',
                    details: xenditData,
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 409,
                })
            }

            return new Response(JSON.stringify({
                error: xenditData.message || 'Failed to create Xendit sub-account',
                details: xenditData,
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: xenditResponse.status,
            })
        }

        console.log('✅ Xendit sub-account created:', xenditData)

        // 5. Store the xendit_account_id in partners table
        const { error: updateError } = await supabaseAdmin
            .from('partners')
            .update({ xendit_account_id: xenditData.id })
            .eq('id', partner_id)

        if (updateError) {
            // Critical: Account created but failed to store ID.
            // Log extensively so we can manually fix.
            console.error('🚨 CRITICAL: Xendit account created but failed to save ID!', {
                partner_id,
                xendit_account_id: xenditData.id,
                error: updateError,
            })

            return new Response(JSON.stringify({
                error: 'Xendit account created but failed to save to database. Contact support.',
                xendit_account_id: xenditData.id,
                code: 'DB_SAVE_FAILED',
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500,
            })
        }

        console.log(`✅ Stored xendit_account_id=${xenditData.id} for partner ${partner_id}`)

        return new Response(JSON.stringify({
            success: true,
            xendit_account_id: xenditData.id,
            xendit_status: xenditData.status,
            business_name: xenditData.public_profile?.business_name,
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error('CRITICAL UNHANDLED ERROR:', error)

        return new Response(JSON.stringify({
            error: 'Internal Server Error',
            message: error.message,
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
