'use server'

import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getPartner, getUserRole } from '@/lib/auth/cached'
import { revalidatePath } from 'next/cache'

const VERCEL_API_TOKEN = process.env.VERCEL_API_TOKEN
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID

async function vercelFetch(path: string, method = 'GET', body?: object) {
    const res = await fetch(`https://api.vercel.com${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${VERCEL_API_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json()
    return { ok: res.ok, status: res.status, data }
}

export async function registerCustomDomain(domain: string) {
    const { user } = await getAuthUser()
    if (!user) return { error: 'Not authenticated' }

    const partner = await getPartner(user.id)
    if (!partner) return { error: 'No partner found' }

    const role = await getUserRole(user.id)
    if (role?.role !== 'owner') return { error: 'Only owner can set custom domain' }

    // Basic domain validation
    const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i
    if (!domainRegex.test(domain)) return { error: 'Invalid domain format' }

    // Check domain not already taken by another partner
    const supabase = await createClient()
    const { data: existing } = await supabase
        .from('partners')
        .select('id')
        .eq('custom_domain', domain)
        .neq('id', partner.id)
        .single()

    if (existing) return { error: 'This domain is already in use' }

    // Register with Vercel
    const { ok, data, status } = await vercelFetch(
        `/v10/projects/${VERCEL_PROJECT_ID}/domains`,
        'POST',
        { name: domain }
    )

    if (!ok && status !== 409) {
        // 409 = domain already added to Vercel project (idempotent)
        console.error('Vercel domain add error:', data)
        return { error: data?.error?.message || 'Failed to register domain with Vercel' }
    }

    // Save to DB
    const { error: dbError } = await supabase
        .from('partners')
        .update({
            custom_domain: domain,
            custom_domain_verified: false,
            custom_domain_added_at: new Date().toISOString(),
        })
        .eq('id', partner.id)

    if (dbError) return { error: dbError.message }

    revalidatePath('/organizer/settings')

    // Return Vercel's verification info
    const verification = data?.verification?.[0]
    return {
        success: true,
        domain,
        verification: verification
            ? {
                  type: verification.type, // 'TXT' or 'CNAME'
                  domain: verification.domain,
                  value: verification.value,
              }
            : null,
    }
}

export async function checkCustomDomainStatus() {
    const { user } = await getAuthUser()
    if (!user) return { error: 'Not authenticated' }

    const partner = await getPartner(user.id)
    if (!partner) return { error: 'No partner found' }

    const supabase = await createClient()
    const { data: partnerData } = await supabase
        .from('partners')
        .select('custom_domain, custom_domain_verified')
        .eq('id', partner.id)
        .single()

    if (!partnerData?.custom_domain) return { error: 'No custom domain configured' }

    const { ok, data } = await vercelFetch(
        `/v9/projects/${VERCEL_PROJECT_ID}/domains/${partnerData.custom_domain}`
    )

    if (!ok) return { error: 'Failed to check domain status' }

    const verified = data?.verified === true

    // Update DB if just became verified
    if (verified && !partnerData.custom_domain_verified) {
        await supabase
            .from('partners')
            .update({ custom_domain_verified: true })
            .eq('id', partner.id)
        revalidatePath('/organizer/settings')
    }

    return {
        domain: partnerData.custom_domain,
        verified,
        verification: data?.verification,
    }
}

export async function removeCustomDomain() {
    const { user } = await getAuthUser()
    if (!user) return { error: 'Not authenticated' }

    const partner = await getPartner(user.id)
    if (!partner) return { error: 'No partner found' }

    const role = await getUserRole(user.id)
    if (role?.role !== 'owner') return { error: 'Only owner can remove custom domain' }

    const supabase = await createClient()
    const { data: partnerData } = await supabase
        .from('partners')
        .select('custom_domain')
        .eq('id', partner.id)
        .single()

    if (!partnerData?.custom_domain) return { error: 'No custom domain to remove' }

    // Remove from Vercel
    await vercelFetch(
        `/v9/projects/${VERCEL_PROJECT_ID}/domains/${partnerData.custom_domain}`,
        'DELETE'
    )

    // Clear from DB
    const { error: dbError } = await supabase
        .from('partners')
        .update({
            custom_domain: null,
            custom_domain_verified: false,
            custom_domain_added_at: null,
        })
        .eq('id', partner.id)

    if (dbError) return { error: dbError.message }

    revalidatePath('/organizer/settings')
    return { success: true }
}
