import { Suspense } from 'react'
import { CheckCircle, Crown, ArrowLeft, ArrowRight,
    Download, Link2, Package, Megaphone, Zap, Star, Gift, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import type { PerkItem } from '@/lib/subscriptions/actions'

const PERK_ICONS: Record<string, typeof Crown> = {
    gated_posts:      Crown,
    early_access:     Zap,
    digital_download: Download,
    community_link:   Link2,
    merch:            Package,
    shoutout:         Megaphone,
    custom:           Star,
}

async function getLatestSubscription() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data } = await supabase
        .from('fan_subscriptions')
        .select(`
            id, current_period_end, status,
            subscription_tiers ( id, name, price_monthly, perks ),
            partners ( business_name, slug, profile_photo_url )
        `)
        .eq('fan_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    return data
}

async function SuccessContent() {
    const sub = await getLatestSubscription()
    const tier = sub?.subscription_tiers as any
    const partner = sub?.partners as any
    const perks: PerkItem[] = tier?.perks || []

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <div className="w-full max-w-md text-center space-y-8">

                {/* Icon */}
                <div className="flex justify-center">
                    <div className="relative">
                        <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                            <Crown className="h-12 w-12 text-primary" />
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center ring-4 ring-background">
                            <CheckCircle className="h-5 w-5 text-white" />
                        </div>
                    </div>
                </div>

                {/* Copy */}
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold">You&apos;re in!</h1>
                    {tier && partner ? (
                        <p className="text-muted-foreground">
                            You&apos;re now a{' '}
                            <span className="font-semibold text-foreground">{tier.name}</span> member of{' '}
                            <span className="font-semibold text-foreground">{partner.business_name}</span>.
                        </p>
                    ) : (
                        <p className="text-muted-foreground">Your subscription is now active.</p>
                    )}
                    {sub?.current_period_end && (
                        <p className="text-sm text-muted-foreground">
                            Renews {format(new Date(sub.current_period_end), 'MMMM d, yyyy')}
                        </p>
                    )}
                </div>

                {/* Perks — real data if available, generic fallback if not */}
                <div className="bg-muted/50 rounded-2xl p-5 space-y-3 text-sm text-left">
                    <p className="font-semibold text-center text-foreground">What you&apos;ve unlocked</p>
                    {perks.length > 0 ? (
                        perks.map((perk, i) => {
                            const Icon = PERK_ICONS[perk.type] ?? Gift
                            return (
                                <div key={i} className="flex items-center gap-2.5">
                                    <Icon className="h-4 w-4 text-primary shrink-0" />
                                    <span className="font-medium">{perk.label}</span>
                                </div>
                            )
                        })
                    ) : (
                        [
                            'Exclusive subscriber posts',
                            'Early event access',
                            'Subscriber-only ticket prices',
                        ].map(p => (
                            <div key={p} className="flex items-center gap-2.5 text-muted-foreground">
                                <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                                {p}
                            </div>
                        ))
                    )}
                </div>

                {/* CTAs */}
                <div className="flex flex-col gap-3">
                    {partner?.slug && (
                        <Button asChild size="lg">
                            <Link href={`/${partner.slug}/membership`} className="gap-2">
                                View your perks
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </Button>
                    )}
                    <Button asChild variant="outline" size="sm">
                        <Link href="/account" className="gap-1.5 text-muted-foreground">
                            <Crown className="h-4 w-4" />
                            My memberships
                        </Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/" className="flex items-center gap-1.5 text-muted-foreground">
                            <ArrowLeft className="h-4 w-4" />
                            Back to Home
                        </Link>
                    </Button>
                </div>
            </div>
        </div>
    )
}

export default function SubscriptionSuccessPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <Crown className="h-8 w-8 text-primary animate-pulse" />
            </div>
        }>
            <SuccessContent />
        </Suspense>
    )
}
