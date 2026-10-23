import { cookies } from 'next/headers'
import { createHmac, timingSafeEqual, randomUUID } from 'crypto'

/**
 * Per-SESSION proof that an admin cleared the second factor.
 *
 * This replaces `app_metadata.mfa_verified_at`, which was per-USER and therefore
 * not a second factor at all: the stamp lived on the user row, so *any* session
 * for that user passed the window. Someone holding only the password could sign
 * in, wait for the real admin to complete their own OTP, and inherit it without
 * ever seeing a code.
 *
 * The proof is now a signed, httpOnly cookie that exists only in the browser that
 * actually entered the code. It cannot be read or forged by client JS, and a
 * second session for the same user starts with nothing.
 *
 * Deliberately NOT keyed on the JWT's `session_id` claim. That would be the
 * tidier key, but if the claim were ever absent the layout and the verify page
 * would disagree forever and lock every admin out of the dashboard with no way
 * back in. A cookie we mint ourselves has no such failure mode.
 *
 * This is a second factor, not an authorization check. The Supabase session is
 * still what proves identity — `readMfaSession()` is only ever consulted *after*
 * `getUser()` and the admin-role check have both passed.
 */

const COOKIE_NAME = 'hh_admin_mfa'

/** Matches the old layout check, so the operational feel is unchanged. */
export const MFA_TTL_MS = 8 * 60 * 60 * 1000

export interface MfaSession {
    userId: string
    verifiedAt: number
    /** Random per-issue, so two cookies for the same user are distinguishable in logs. */
    jti: string
}

/**
 * The service-role key is already required by every caller in this module's
 * sibling (otp-actions), is high-entropy, and never reaches the browser — so it
 * works as the signing key without asking the operator to provision another
 * secret. `MFA_COOKIE_SECRET` overrides it if you'd rather separate the two.
 */
function signingKey(): string {
    const key = process.env.MFA_COOKIE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!key) throw new Error('Server configuration error')
    return key
}

function b64url(input: Buffer | string): string {
    return Buffer.from(input).toString('base64url')
}

function sign(payload: string): string {
    return createHmac('sha256', signingKey()).update(payload).digest('base64url')
}

/**
 * Mirrors the domain the Supabase session cookie uses (see lib/supabase/server).
 * If the two were scoped differently, an admin arriving on a different host
 * spelling would hold a session but no MFA proof and bounce to /verify forever.
 */
function cookieDomain(): string | undefined {
    if (process.env.NODE_ENV === 'development') return undefined
    return `.${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'hanghut.com'}`
}

/** Call only after the OTP has actually been verified for this user. */
export async function issueMfaCookie(userId: string): Promise<void> {
    const session: MfaSession = { userId, verifiedAt: Date.now(), jti: randomUUID() }
    const payload = b64url(JSON.stringify(session))
    const token = `${payload}.${sign(payload)}`

    const store = await cookies()
    store.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== 'development',
        sameSite: 'lax',
        path: '/',
        domain: cookieDomain(),
        maxAge: Math.floor(MFA_TTL_MS / 1000),
    })
}

/**
 * The current browser's MFA proof, or null. Null for every reason: no cookie,
 * malformed, bad signature, expired. Callers treat null as "send them to
 * /verify" — there is no partial-trust state.
 */
export async function readMfaSession(): Promise<MfaSession | null> {
    const store = await cookies()
    const raw = store.get(COOKIE_NAME)?.value
    if (!raw) return null

    const dot = raw.lastIndexOf('.')
    if (dot <= 0) return null

    const payload = raw.slice(0, dot)
    const provided = Buffer.from(raw.slice(dot + 1), 'base64url')

    let expected: Buffer
    try {
        expected = Buffer.from(sign(payload), 'base64url')
    } catch {
        return null
    }

    // Length check first: timingSafeEqual throws on a mismatch rather than
    // returning false, and a forged cookie must not surface as a 500.
    if (provided.length !== expected.length) return null
    if (!timingSafeEqual(provided, expected)) return null

    let session: MfaSession
    try {
        session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    } catch {
        return null
    }

    if (typeof session?.userId !== 'string' || typeof session?.verifiedAt !== 'number') return null
    if (Date.now() - session.verifiedAt > MFA_TTL_MS) return null

    return session
}

/**
 * True only when this browser cleared the second factor for THIS user.
 *
 * The userId comparison is the load-bearing half: without it a cookie minted for
 * one admin would satisfy the check after switching accounts in the same browser.
 */
export async function hasVerifiedMfa(userId: string): Promise<boolean> {
    const session = await readMfaSession()
    return session?.userId === userId
}

export async function clearMfaCookie(): Promise<void> {
    const store = await cookies()
    store.set(COOKIE_NAME, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV !== 'development',
        sameSite: 'lax',
        path: '/',
        domain: cookieDomain(),
        maxAge: 0,
    })
}
