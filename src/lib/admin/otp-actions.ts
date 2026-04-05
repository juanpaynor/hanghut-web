'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Send a 6-digit OTP code to the admin/support user's email via Resend.
 * Called after successful password authentication.
 */
export async function sendOtpCode(userId: string) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Server configuration error')
    }

    const adminSupabase = createSupabaseClient(supabaseUrl, serviceRoleKey)

    // Get user email
    const { data: userData, error: userError } = await adminSupabase
        .from('users')
        .select('email')
        .eq('id', userId)
        .single()

    if (userError || !userData?.email) {
        throw new Error('User not found')
    }

    // Rate limit: max 3 codes in 15 minutes
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { count } = await adminSupabase
        .from('admin_otp_codes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', fifteenMinAgo)

    if (count && count >= 3) {
        throw new Error('Too many verification codes requested. Please wait 15 minutes.')
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString()

    // Hash the code for storage (simple SHA-256)
    const encoder = new TextEncoder()
    const data = encoder.encode(code + process.env.OTP_SALT || 'hanghut-otp-salt')
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const codeHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    // Invalidate previous unused codes
    await adminSupabase
        .from('admin_otp_codes')
        .update({ used: true })
        .eq('user_id', userId)
        .eq('used', false)

    // Store new code (5-minute expiry)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    const { error: insertError } = await adminSupabase
        .from('admin_otp_codes')
        .insert({
            user_id: userId,
            code_hash: codeHash,
            expires_at: expiresAt,
        })

    if (insertError) {
        console.error('Error storing OTP:', insertError)
        throw new Error('Failed to generate verification code')
    }

    // Send via Resend (edge function)
    const { error: sendError } = await adminSupabase.functions.invoke('send-otp-code', {
        body: {
            email: userData.email,
            code,
        },
    })

    if (sendError) {
        console.error('Error sending OTP email:', sendError)
        throw new Error('Failed to send verification email')
    }

    // Return masked email for display
    const maskedEmail = maskEmail(userData.email)
    return { success: true, maskedEmail }
}

/**
 * Verify the OTP code entered by the user.
 * On success, sets app_metadata.mfa_verified_at to current timestamp.
 */
export async function verifyOtpCode(userId: string, code: string) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Server configuration error')
    }

    const adminSupabase = createSupabaseClient(supabaseUrl, serviceRoleKey)

    // Hash the provided code
    const encoder = new TextEncoder()
    const data = encoder.encode(code + process.env.OTP_SALT || 'hanghut-otp-salt')
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const codeHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    // Find the matching code
    const now = new Date().toISOString()
    const { data: otpRecord, error } = await adminSupabase
        .from('admin_otp_codes')
        .select('id')
        .eq('user_id', userId)
        .eq('code_hash', codeHash)
        .eq('used', false)
        .gte('expires_at', now)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (error || !otpRecord) {
        return { success: false, error: 'Invalid or expired verification code' }
    }

    // Mark code as used
    await adminSupabase
        .from('admin_otp_codes')
        .update({ used: true })
        .eq('id', otpRecord.id)

    // Set mfa_verified_at in user's app_metadata
    const { error: updateError } = await adminSupabase.auth.admin.updateUserById(userId, {
        app_metadata: {
            mfa_verified_at: new Date().toISOString(),
        },
    })

    if (updateError) {
        console.error('Error setting MFA metadata:', updateError)
        return { success: false, error: 'Failed to verify session' }
    }

    return { success: true }
}

/**
 * Mask an email for display: j***@gmail.com
 */
function maskEmail(email: string): string {
    const [local, domain] = email.split('@')
    if (local.length <= 2) return `${local[0]}***@${domain}`
    return `${local[0]}${local[1]}***@${domain}`
}
