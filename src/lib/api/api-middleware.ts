import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from './api-helpers'
import { createHash } from 'crypto'

interface AuthResult {
    partnerId: string
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

    // Look up by prefix first, then verify hash
    const { data: keyRecord, error } = await supabase
        .from('api_keys')
        .select('id, partner_id, key_hash, is_active')
        .eq('key_prefix', prefix)
        .single()

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

    // Rate limit check (100 requests per 60 seconds per key)
    const { data: allowed } = await supabase.rpc('check_rate_limit', {
        p_key_prefix: prefix,
        p_max_requests: 100,
        p_window_seconds: 60
    })

    if (allowed === false) {
        return apiError('Rate limit exceeded. Max 100 requests per minute.', 429)
    }

    return { partnerId: keyRecord.partner_id }
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
