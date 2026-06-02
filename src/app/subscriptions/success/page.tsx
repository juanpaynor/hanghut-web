import { Suspense } from 'react'
import { CheckCircle, Crown, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

async function getLatestSubscription() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data } = await supabase
        .from('fan_subscriptions')
        .select(`
            id, current_period_end, status,
            subscription_tiers ( name, price_monthly ),
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
                    <h1 className="text-3xl font-bold">You're in! 🎉</h1>
                    {tier && partner ? (
                        <p className="text-muted-foreground">
                            You're now a <span className="font-semibold text-foreground">{tier.name}</span> member of{' '}
                            <span className="font-semibold text-foreground">{partner.business_name}</span>.
                        </p>
                    ) : (
                        <p className="text-muted-foreground">Your subscription is now active.</p>
                    )}
                    {sub?.current_period_end && (
                        <p className="text-sm text-muted-foreground">
                            Your membership renews on{' '}
                            {new Date(sub.current_period_end).toLocaleDateString('en-PH', {
                                month: 'long', day: 'numeric', year: 'numeric'
                            })}
                        </p>
                    )}
                </div>

                {/* Perks reminder */}
                <div className="bg-muted/50 rounded-2xl p-5 space-y-3 text-sm text-left">
                    <p className="font-semibold text-center text-foreground">What you unlock</p>
                    {[
                        'Exclusive subscriber posts',
                        'Early event access',
                        'Subscriber-only ticket prices',
                        'Access to subscriber-only events',
                    ].map(perk => (
                        <div key={perk} className="flex items-center gap-2.5 text-muted-foreground">
                            <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                            {perk}
                        </div>
                    ))}
                </div>

                {/* CTAs */}
                <div className="flex flex-col gap-3">
                    {partner?.slug && (
                        <Button asChild size="lg">
                            <Link href={`/${partner.slug}`}>
                                Go to {partner.business_name}
                            </Link>
                        </Button>
                    )}
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
