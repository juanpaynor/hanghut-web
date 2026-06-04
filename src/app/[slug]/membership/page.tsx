import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { getSubscriptionStatus } from '@/lib/subscriptions/access'
import { MembershipPage } from '@/components/storefront/membership-page'
import { Inter, Playfair_Display, Space_Mono } from 'next/font/google'
import { hexToHsl } from '@/lib/utils'
import type { Metadata } from 'next'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-serif' })
const spaceMono = Space_Mono({ weight: '400', subsets: ['latin'], variable: '--font-mono' })

export const dynamic = 'force-dynamic' // perks and claims must be fresh

interface Props {
    params: Promise<{ slug: string }>
}

async function getPartnerWithTiers(slug: string) {
    const supabase = await createClient()

    const { data: partner } = await supabase
        .from('partners')
        .select('id, business_name, slug, description, profile_photo_url, cover_image_url, branding')
        .eq('slug', slug)
        .single()

    if (!partner) return null

    const [tiersRes, postsRes] = await Promise.all([
        supabase
            .from('subscription_tiers')
            .select('id, name, description, price_monthly, image_url, long_description, perks, is_active')
            .eq('partner_id', partner.id)
            .eq('is_active', true)
            .order('price_monthly', { ascending: true }),
        supabase
            .from('subscription_posts')
            .select('id, title, body, published_at, gated_url, gated_url_label, subscription_tiers(name)')
            .eq('partner_id', partner.id)
            .not('published_at', 'is', null)
            .lte('published_at', new Date().toISOString())
            .order('published_at', { ascending: false })
            .limit(20),
    ])

    return { partner, tiers: tiersRes.data || [], posts: postsRes.data || [] }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params
    const data = await getPartnerWithTiers(slug)
    if (!data) return { title: 'Not Found' }
    return {
        title: `${data.partner.business_name} Membership — HangHut`,
        description: `Join ${data.partner.business_name} and unlock exclusive perks, early access, and more.`,
        openGraph: {
            images: data.partner.cover_image_url ? [data.partner.cover_image_url] : [],
        },
    }
}

export default async function MembershipLandingPage({ params }: Props) {
    const { slug } = await params
    const data = await getPartnerWithTiers(slug)

    if (!data) notFound()

    const { partner, tiers, posts } = data

    // Branding
    const branding = partner.branding || {}
    const primaryColor = branding.colors?.primary
    const fontPref = branding.design?.font || 'sans'
    const fontMap: Record<string, string> = {
        sans:  inter.className,
        serif: playfair.className,
        mono:  spaceMono.className,
    }
    const fontClass = fontMap[fontPref] || inter.className
    const themeStyle = primaryColor
        ? { '--primary': hexToHsl(primaryColor), '--ring': hexToHsl(primaryColor) } as React.CSSProperties
        : undefined

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const subscriptionStatus = await getSubscriptionStatus(partner.id).catch(() => ({
        isAuthenticated: false, isActive: false, status: null,
        subscriptionId: null, tierId: null, tierName: null, currentPeriodEnd: null, cancelledAt: null,
    }))

    // Fetch subscription row id + existing claims — only if user is an active subscriber
    let subscriptionId: string | null = null
    let existingClaims: { perk_type: string; claim_period: string; status: string }[] = []

    let subscriberGroupId: string | null = null

    if (user && subscriptionStatus.isActive && subscriptionStatus.tierId) {
        const [subRes, claimsRes, groupRes] = await Promise.all([
            supabase
                .from('fan_subscriptions')
                .select('id')
                .eq('fan_id', user.id)
                .eq('partner_id', partner.id)
                .eq('tier_id', subscriptionStatus.tierId)
                .maybeSingle(),
            supabase
                .from('subscription_claims')
                .select('perk_type, claim_period, status')
                .eq('fan_id', user.id)
                .eq('partner_id', partner.id),
            supabase
                .from('groups')
                .select('id')
                .eq('subscription_tier_id', subscriptionStatus.tierId)
                .eq('group_type', 'subscriber')
                .maybeSingle(),
        ])
        subscriptionId = subRes.data?.id ?? null
        existingClaims = claimsRes.data || []
        subscriberGroupId = groupRes.data?.id ?? null
    }

    return (
        <MembershipPage
            partner={{
                id: partner.id,
                slug: partner.slug,
                business_name: partner.business_name,
                description: partner.description,
                profile_photo_url: partner.profile_photo_url,
                cover_image_url: partner.cover_image_url,
            }}
            tiers={tiers as any}
            posts={posts as any}
            subscriptionStatus={subscriptionStatus as any}
            subscriptionId={subscriptionId}
            subscriberGroupId={subscriberGroupId}
            existingClaims={existingClaims}
            fontClass={fontClass}
            themeStyle={themeStyle}
        />
    )
}
