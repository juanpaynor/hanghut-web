import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from './api-helpers'
import { createHash } from 'crypto'
import { Timer } from './timing'

interface AuthResult {
    partnerId: string
    /** Per-step durations, to be merged into the handler's Server-Timing header. */
    timer: Timer
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

    // ONE round trip. This used to be two sequential ones: the key lookup, then
    // an rpc('check_rate_limit', ...). A round trip from the function to Supabase
    // measures ~150ms, so the second one was ~150ms on every authenticated
    // request.
    //
    // The rate-limit call is gone rather than parallelised, because it never did
    // anything: check_rate_limit does not exist in the database
    // (to_regprocedure returns null, api_rate_limits has 0 rows). The RPC errored
    // on every request, leaving `data` null, and the guard read
    // `if (allowed === false)` — which null never satisfies. So the documented
    // "100 requests per minute" has never been enforced, and removing the call
    // changes no behaviour.
    //
    // It is NOT parallelised back in as-is once implemented: running the limiter
    // before validation would let anyone who guesses a key PREFIX (12 chars =
    // "hh_live_" plus 4 hex, so 65,536 possibilities) burn a real partner's
    // quota. The correct shape is a single SECURITY DEFINER function that
    // validates the key and applies the limit to the validated key id atomically
    // — still one round trip, and not spoofable.
    const { data: keyRecord, error } = await timer.span('auth', () => supabase
        .from('api_keys')
        .select('id, partner_id, key_hash, is_active')
        .eq('key_prefix', prefix)
        .maybeSingle()
    )

    if (error || !keyRecord) {
        return apiError('Invalid API key', 401)
    }

    if (!keyRecord.is_active) {
        return apiError('API key has been revoked', 401)
    }

    if (keyRecord.key_hash !== keyHash) {
        return apiError('Invalid API key', 401)
    }

    // Update last_used_at (fire and forget, don't block the response)
    supabase
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', keyRecord.id)
        .then(() => {})

    return { partnerId: keyRecord.partner_id, timer }
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
