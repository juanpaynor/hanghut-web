import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { getSubscriptionStatus } from '@/lib/subscriptions/access'
import { TierDetailPage } from '@/components/storefront/tier-detail-page'
import type { Metadata } from 'next'

export const revalidate = 60

interface Props {
    params: Promise<{ slug: string; tierId: string }>
}

async function getTierWithPartner(slug: string, tierId: string) {
    const supabase = await createClient()

    const { data: partner } = await supabase
        .from('partners')
        .select('id, business_name, slug, description, profile_photo_url, cover_image_url')
        .eq('slug', slug)
        .single()

    if (!partner) return null

    const { data: tier } = await supabase
        .from('subscription_tiers')
        .select('id, name, description, price_monthly, image_url, long_description, perks, is_active')
        .eq('id', tierId)
        .eq('partner_id', partner.id)
        .eq('is_active', true)
        .single()

    if (!tier) return null

    return { partner, tier }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug, tierId } = await params
    const data = await getTierWithPartner(slug, tierId)
    if (!data) return { title: 'Not Found' }
    const { partner, tier } = data
    return {
        title: `${tier.name} — ${partner.business_name} Membership`,
        description: tier.description ?? `Join ${partner.business_name}'s ${tier.name} tier for ₱${Number(tier.price_monthly).toLocaleString()}/mo.`,
        openGraph: {
            title: `${tier.name} — ${partner.business_name}`,
            description: tier.description ?? `₱${Number(tier.price_monthly).toLocaleString()}/mo membership`,
            images: tier.image_url
                ? [{ url: tier.image_url }]
                : partner.cover_image_url
                    ? [{ url: partner.cover_image_url }]
                    : [],
        },
    }
}

export default async function TierPage({ params }: Props) {
    const { slug, tierId } = await params
    const data = await getTierWithPartner(slug, tierId)

    if (!data) notFound()

    const { partner, tier } = data

    const subscriptionStatus = await getSubscriptionStatus(partner.id).catch(() => ({
        isAuthenticated: false, isActive: false, status: null,
        tierId: null, tierName: null, currentPeriodEnd: null, cancelledAt: null,
    }))

    return (
        <TierDetailPage
            partner={{
                id: partner.id,
                slug: partner.slug,
                business_name: partner.business_name,
                profile_photo_url: partner.profile_photo_url,
                cover_image_url: partner.cover_image_url,
            }}
            tier={tier as any}
            subscriptionStatus={subscriptionStatus as any}
        />
    )
}
