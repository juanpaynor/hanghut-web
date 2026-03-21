'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createHash, randomBytes } from 'crypto'

/**
 * List API keys for the current partner (only shows prefix, never the full key)
 */
export async function getApiKeys(partnerId: string) {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('api_keys')
        .select('id, key_prefix, name, is_active, created_at, last_used_at')
        .eq('partner_id', partnerId)
        .order('created_at', { ascending: false })

    if (error) {
        return { keys: [], error: error.message }
    }

    return { keys: data || [], error: null }
}

/**
 * Generate a new API key. Returns the raw key ONCE.
 */
export async function createApiKey(partnerId: string, name: string = 'Default') {
    const supabase = createAdminClient()

    // Limit to 5 active keys per partner
    const { count } = await supabase
        .from('api_keys')
        .select('*', { count: 'exact', head: true })
        .eq('partner_id', partnerId)
        .eq('is_active', true)

    if ((count || 0) >= 5) {
        return { key: null, rawKey: null, error: 'Maximum of 5 active API keys allowed' }
    }

    const randomPart = randomBytes(16).toString('hex')
    const rawKey = `hh_live_${randomPart}`
    const prefix = rawKey.substring(0, 12)
    const keyHash = createHash('sha256').update(rawKey).digest('hex')

    const { data, error } = await supabase
        .from('api_keys')
        .insert({
            partner_id: partnerId,
            key_prefix: prefix,
            key_hash: keyHash,
            name: name.trim() || 'Default',
        })
        .select('id, key_prefix, name, created_at')
        .single()

    if (error) {
        return { key: null, rawKey: null, error: error.message }
    }

    return { key: data, rawKey, error: null }
}

/**
 * Revoke (deactivate) an API key
 */
export async function revokeApiKey(partnerId: string, keyId: string) {
    const supabase = createAdminClient()

    const { error } = await supabase
        .from('api_keys')
        .update({ is_active: false })
        .eq('id', keyId)
        .eq('partner_id', partnerId)

    if (error) {
        return { success: false, error: error.message }
    }

    return { success: true, error: null }
}

/**
 * Delete an API key permanently
 */
export async function deleteApiKey(partnerId: string, keyId: string) {
    const supabase = createAdminClient()

    const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', keyId)
        .eq('partner_id', partnerId)

    if (error) {
        return { success: false, error: error.message }
    }

    return { success: true, error: null }
}
