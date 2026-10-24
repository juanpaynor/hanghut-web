import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from './api-helpers'
import { createHash } from 'crypto'
import { Timer } from './timing'

interface AuthResult {
    partnerId: string
    /** Per-step durations, to be merged into the handler's Server-Timing header. */
    timer: Timer
    /**
     * Rate-limit state for this request, for the handler's X-RateLimit-* headers.
     * Null when the limiter is not available (see the fallback below), so callers
     * can tell "no limit in force" from "limit with budget remaining".
     */
    rateLimit: { limit: number; remaining: number; resetAt: string } | null
}

/** The ceiling the public docs publish. Changing it changes the docs. */
export const RATE_LIMIT_PER_MINUTE = 100

function rateLimitHeaders(limit: number, remaining: number, resetAt: string) {
    return {
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': String(Math.max(0, remaining)),
        'X-RateLimit-Reset': resetAt,
    }
}

/**
 * Authenticate an API request using Bearer token.
 * Returns the partner_id if valid, or a NextResponse error.
 */
export async function authenticateApiKey(
    request: Request
): Promise<AuthResult | Response> {
    const authHeader = request.headers.get('Authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return apiError('Missing or invalid Authorization header. Use: Bearer <api_key>', 401)
    }

    const apiKey = authHeader.replace('Bearer ', '').trim()

    if (!apiKey || apiKey.length < 10) {
        return apiError('Invalid API key format', 401)
    }

    // Extract prefix (first 12 chars) for lookup
    const prefix = apiKey.substring(0, 12)

    // Hash the full key for comparison
    const keyHash = createHash('sha256').update(apiKey).digest('hex')

    const supabase = createAdminClient()
    const timer = new Timer()

    // ONE round trip that both validates the key and consumes a unit of its rate
    // budget. It used to be two sequential calls -- the key lookup, then an
    // rpc('check_rate_limit', ...) -- and a Vercel-to-Supabase hop measures
    // ~150ms, so the second one cost that on every authenticated request.
    //
    // The limiter is NOT a separate call bolted back on. Metering by key_prefix
    // before validation would let anyone who guesses a PREFIX (12 chars =
    // "hh_live_" plus 4 hex, so 65,536 possibilities) burn a real partner's
    // quota without ever holding a key. authenticate_api_key() proves the key and
    // meters the proven key id inside one statement, so neither is spoofable and
    // neither costs an extra hop.
    const { data: rows, error } = await timer.span('auth', () => supabase
        .rpc('authenticate_api_key', {
            p_prefix: prefix,
            p_hash: keyHash,
            p_limit: RATE_LIMIT_PER_MINUTE,
        })
    )

    // The function may not exist yet -- the migration and this code deploy
    // independently. Fall back to the plain lookup rather than refusing every
    // request: a missing limiter should degrade to the previous behaviour (no
    // ceiling), never to a locked-out API.
    if (error && (error.code === 'PGRST202' || error.code === '42883')) {
        return legacyAuthenticate(supabase, prefix, keyHash, timer)
    }

    if (error) {
        console.error('[api-auth] authenticate_api_key failed:', error)
        return apiError('Authentication unavailable', 503)
    }

    const result = Array.isArray(rows) ? rows[0] : rows
    if (!result) return apiError('Invalid API key', 401)

    switch (result.outcome) {
        case 'invalid':
            return apiError('Invalid API key', 401)
        case 'revoked':
            return apiError('API key has been revoked', 401)
        case 'rate_limited': {
            const reset = new Date(result.reset_at).toISOString()
            const retryAfter = Math.max(
                1,
                Math.ceil((new Date(result.reset_at).getTime() - Date.now()) / 1000)
            )
            return apiError(
                `Rate limit exceeded. Max ${RATE_LIMIT_PER_MINUTE} requests per minute.`,
                429,
                { ...rateLimitHeaders(RATE_LIMIT_PER_MINUTE, 0, reset), 'Retry-After': String(retryAfter) }
            )
        }
    }

    return {
        partnerId: result.partner_id,
        timer,
        rateLimit: {
            limit: RATE_LIMIT_PER_MINUTE,
            remaining: result.remaining ?? 0,
            resetAt: new Date(result.reset_at).toISOString(),
        },
    }
}

/**
 * The pre-limiter path, kept only so a missing migration cannot take the API
 * down. Validates the key and nothing else -- no ceiling is applied, which is
 * exactly what shipped before authenticate_api_key() existed.
 */
async function legacyAuthenticate(
    supabase: ReturnType<typeof createAdminClient>,
    prefix: string,
    keyHash: string,
    timer: Timer
): Promise<AuthResult | Response> {
    const { data: keyRecord, error } = await timer.span('auth-fallback', () => supabase
        .from('api_keys')
        .select('id, partner_id, key_hash, is_active')
        .eq('key_prefix', prefix)
        .limit(1)
        .maybeSingle()
    )

    if (error || !keyRecord) return apiError('Invalid API key', 401)
    if (!keyRecord.is_active) return apiError('API key has been revoked', 401)
    if (keyRecord.key_hash !== keyHash) return apiError('Invalid API key', 401)

    supabase
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', keyRecord.id)
        .then(() => {})

    return { partnerId: keyRecord.partner_id, timer, rateLimit: null }
}

/**
 * Check if the auth result is an error response
 */
export function isAuthError(result: AuthResult | Response): result is Response {
    return result instanceof Response
}

/**
 * Generate a new API key for a partner.
 * Returns the raw key (show once!) and stores the hash.
 */
export async function generateApiKey(partnerId: string, name = 'Default') {
    const { randomBytes } = await import('crypto')

    // Generate a random key: hh_live_ + 32 random hex chars
    const randomPart = randomBytes(16).toString('hex')
    const rawKey = `hh_live_${randomPart}`
    const prefix = rawKey.substring(0, 12)
    const keyHash = createHash('sha256').update(rawKey).digest('hex')

    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('api_keys')
        .insert({
            partner_id: partnerId,
            key_prefix: prefix,
            key_hash: keyHash,
            name,
        })
        .select('id, key_prefix, name, created_at')
        .single()

    if (error) {
        throw new Error(`Failed to create API key: ${error.message}`)
    }

    return {
        ...data,
        raw_key: rawKey, // Only returned once!
    }
}
