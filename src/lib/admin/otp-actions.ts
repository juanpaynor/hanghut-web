'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createHmac, randomInt, timingSafeEqual } from 'crypto'
import { issueMfaCookie } from './mfa-session'

/**
 * Admin second factor: issue and verify a 6-digit email code.
 *
 * Both actions derive the user from the caller's SESSION. Neither takes a user
 * id, and that is the whole point — the previous signatures were
 * `sendOtpCode(userId)` and `verifyOtpCode(userId, code)`, with the id supplied
 * by client JS from a non-httpOnly `pending_2fa_user` cookie and never compared
 * to anything. Server actions are ordinary POST endpoints, so that made
 * verification an unauthenticated brute-force oracle against any user id, and
 * made the send side a way to mail a code to any admin on demand.
 *
 * Login still establishes a session before the code is sent, so deriving from
 * the session costs nothing operationally: the session proves *who*, the code
 * proves *they have the mailbox*, and `issueMfaCookie` records the second fact
 * against this browser only. See lib/admin/mfa-session for why it is a cookie
 * and not `app_metadata`.
 */

const CODE_TTL_MS = 5 * 60 * 1000
const MAX_SENDS_PER_WINDOW = 3
const SEND_WINDOW_MS = 15 * 60 * 1000

/**
 * Wrong guesses allowed per code before it is burned.
 *
 * There was previously no limit at all on the verify side — the 3-per-15-minutes
 * cap applied only to *sending*. Six digits is a million combinations and a
 * server action can be scripted, so the code was guessable inside its own
 * five-minute window. Five leaves room for a fat-fingered digit and nothing more.
 */
const MAX_ATTEMPTS = 5

function adminClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Server configuration error')
    return createSupabaseClient(supabaseUrl, serviceRoleKey)
}

/**
 * HMAC rather than a plain digest, and note the parentheses.
 *
 * The old line was `encoder.encode(code + process.env.OTP_SALT || 'hanghut-otp-salt')`,
 * which parses as `(code + OTP_SALT) || fallback`. `"123456" + undefined` is the
 * truthy string `"123456undefined"`, so the fallback was dead code and the pepper
 * was the literal text "undefined" whenever OTP_SALT was unset.
 *
 * The fallback is kept non-fatal on purpose: throwing here would lock every admin
 * out of the dashboard if OTP_SALT turns out to be unset in production. It logs
 * instead, loudly, once per call.
 */
function hashCode(code: string): string {
    let pepper = process.env.OTP_SALT
    if (!pepper) {
        console.warn('[otp] OTP_SALT is not set — using the fallback pepper. Set it.')
        pepper = 'hanghut-otp-salt'
    }
    return createHmac('sha256', pepper).update(code).digest('hex')
}

/** Equal-length hex compare that does not leak a prefix match through timing. */
function hashesMatch(a: string, b: string): boolean {
    const ba = Buffer.from(a, 'utf8')
    const bb = Buffer.from(b, 'utf8')
    if (ba.length !== bb.length) return false
    return timingSafeEqual(ba, bb)
}

/**
 * The signed-in user, but only if they really are an admin.
 *
 * Both actions run this first. Without it, any authenticated user could drive the
 * OTP machinery for an admin account.
 */
async function requireAdminUser(): Promise<{ id: string } | null> {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return null

    const { data: adminRole, error: roleError } = await supabase.rpc('is_user_admin')
    if (roleError || !adminRole) return null

    return { id: user.id }
}

/** Masked destination for the verify screen, derived server-side. */
export async function getOtpContext(): Promise<{ maskedEmail: string } | null> {
    const user = await requireAdminUser()
    if (!user) return null

    const { data } = await adminClient()
        .from('users')
        .select('email')
        .eq('id', user.id)
        .single()

    if (!data?.email) return null
    return { maskedEmail: maskEmail(data.email) }
}

/**
 * Mail a fresh 6-digit code to the signed-in admin's address.
 * The address is looked up server-side; the caller cannot choose a recipient.
 */
export async function sendOtpCode(): Promise<{ success: true; maskedEmail: string }> {
    const user = await requireAdminUser()
    if (!user) throw new Error('Not authorized')

    const admin = adminClient()

    const { data: userData, error: userError } = await admin
        .from('users')
        .select('email')
        .eq('id', user.id)
        .single()

    if (userError || !userData?.email) throw new Error('User not found')

    const windowStart = new Date(Date.now() - SEND_WINDOW_MS).toISOString()
    const { count } = await admin
        .from('admin_otp_codes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', windowStart)

    if (count && count >= MAX_SENDS_PER_WINDOW) {
        throw new Error('Too many verification codes requested. Please wait 15 minutes.')
    }

    // randomInt is a CSPRNG. Math.random() was not: V8 uses xorshift128+, whose
    // internal state is recoverable from a handful of outputs, which for a
    // six-digit secret means the next code is predictable rather than guessed.
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0')

    // One live code per admin at a time.
    await admin
        .from('admin_otp_codes')
        .update({ used: true })
        .eq('user_id', user.id)
        .eq('used', false)

    const { error: insertError } = await admin
        .from('admin_otp_codes')
        .insert({
            user_id: user.id,
            code_hash: hashCode(code),
            expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
        })

    if (insertError) {
        console.error('Error storing OTP:', insertError)
        throw new Error('Failed to generate verification code')
    }

    const { error: sendError } = await admin.functions.invoke('send-otp-code', {
        body: { email: userData.email, code },
    })

    if (sendError) {
        console.error('Error sending OTP email:', sendError)
        throw new Error('Failed to send verification email')
    }

    return { success: true, maskedEmail: maskEmail(userData.email) }
}

/**
 * Check a code against the signed-in admin's live code and, on success, record
 * the second factor for THIS browser.
 */
export async function verifyOtpCode(code: string): Promise<{ success: boolean; error?: string }> {
    const user = await requireAdminUser()
    if (!user) return { success: false, error: 'Not authorized' }

    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
        return { success: false, error: 'Invalid or expired verification code' }
    }

    const admin = adminClient()

    // Fetch the live code and compare in application code, rather than matching
    // on the hash in the WHERE clause. The old query did the latter, which left
    // nowhere to count a failure: a wrong guess simply returned no row.
    // `select('*')` rather than naming `attempts`: PostgREST fails the entire
    // query on an unknown column, so naming it would lock every admin out of the
    // dashboard if this code shipped before the migration that adds it. With `*`
    // the field is simply absent and the `?? 0` below takes over — the limit is
    // unenforced until the column exists, but nobody is locked out.
    const { data: record, error } = await admin
        .from('admin_otp_codes')
        .select('*')
        .eq('user_id', user.id)
        .eq('used', false)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (error || !record) {
        return { success: false, error: 'Invalid or expired verification code' }
    }

    const attempts = record.attempts ?? 0
    if (attempts >= MAX_ATTEMPTS) {
        await admin.from('admin_otp_codes').update({ used: true }).eq('id', record.id)
        return { success: false, error: 'Too many incorrect attempts. Request a new code.' }
    }

    if (!hashesMatch(hashCode(code), record.code_hash)) {
        const next = attempts + 1
        await admin
            .from('admin_otp_codes')
            .update({ attempts: next, used: next >= MAX_ATTEMPTS })
            .eq('id', record.id)

        return {
            success: false,
            error: next >= MAX_ATTEMPTS
                ? 'Too many incorrect attempts. Request a new code.'
                : 'Invalid or expired verification code',
        }
    }

    // Burn the code before issuing the proof, so a replay cannot win a race.
    const { error: burnError } = await admin
        .from('admin_otp_codes')
        .update({ used: true })
        .eq('id', record.id)
        .eq('used', false)

    if (burnError) {
        console.error('Error consuming OTP:', burnError)
        return { success: false, error: 'Failed to verify session' }
    }

    await issueMfaCookie(user.id)
    return { success: true }
}

/** Mask an email for display: j***@gmail.com */
function maskEmail(email: string): string {
    const [local, domain] = email.split('@')
    if (!local || !domain) return 'your email'
    if (local.length <= 2) return `${local[0]}***@${domain}`
    return `${local[0]}${local[1]}***@${domain}`
}
