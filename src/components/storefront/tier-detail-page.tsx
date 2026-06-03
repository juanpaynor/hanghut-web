'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import {
    Crown, Check, Loader2, ArrowLeft,
    Package, Megaphone, Zap, Download, Link2, Gift, Star,
} from 'lucide-react'
import { format } from 'date-fns'
import { initiateSubscriptionCheckout, cancelSubscription } from '@/lib/subscriptions/actions'
import type { SubscriptionStatus } from '@/lib/subscriptions/access'
import type { PerkItem } from '@/lib/subscriptions/actions'

const PERK_ICONS: Record<PerkItem['type'], typeof Crown> = {
    gated_posts:      Crown,
    early_access:     Zap,
    digital_download: Download,
    community_link:   Link2,
    merch:            Package,
    shoutout:         Megaphone,
    custom:           Star,
}

const PERK_CLAIM_INFO: Partial<Record<PerkItem['type'], string>> = {
    merch:    'Submit your shipping details after subscribing and we\'ll send it to you.',
    shoutout: 'Submit your request after subscribing and we\'ll give you a shoutout.',
}

interface Tier {
    id: string
    name: string
    description: string | null
    price_monthly: number
    image_url: string | null
    long_description: string | null
    perks: PerkItem[] | null
}

interface Partner {
    id: string
    slug: string
    business_name: string
    profile_photo_url: string | null
    cover_image_url: string | null
}

interface Props {
    partner: Partner
    tier: Tier
    subscriptionStatus: SubscriptionStatus
}

function SubscribeButton({
    tier,
    isCurrentTier,
    isPending,
    isLoading,
    onSubscribe,
    onCancel,
    status,
    currentPeriodEnd,
    size = 'default',
}: {
    tier: Tier
    isCurrentTier: boolean
    isPending: boolean
    isLoading: boolean
    onSubscribe: () => void
    onCancel: () => void
    status: SubscriptionStatus['status']
    currentPeriodEnd: string | null
    size?: 'default' | 'lg'
}) {
    if (isCurrentTier) {
        return (
            <div className="space-y-2">
                <Button className="w-full" variant="secondary" disabled size={size}>
                    <Check className="h-4 w-4 mr-2" /> Current Plan
                </Button>
                {status !== 'cancelled' && (
                    <button
                        onClick={onCancel}
                        disabled={isPending}
                        className="w-full text-xs text-muted-foreground hover:text-destructive transition-colors text-center"
                    >
                        Cancel membership
                    </button>
                )}
                {currentPeriodEnd && (
                    <p className="text-xs text-center text-muted-foreground">
                        {status === 'cancelled'
                            ? `Access until ${format(new Date(currentPeriodEnd), 'MMM d, yyyy')}`
                            : `Renews ${format(new Date(currentPeriodEnd), 'MMM d, yyyy')}`}
                    </p>
                )}
            </div>
        )
    }

    return (
        <Button className="w-full" size={size} disabled={isPending} onClick={onSubscribe}>
            {isLoading
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</>
                : `Subscribe — ₱${Number(tier.price_monthly).toLocaleString()}/mo`
            }
        </Button>
    )
}

export function TierDetailPage({ partner, tier, subscriptionStatus }: Props) {
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()
    const [isLoading, setIsLoading] = useState(false)
    const [cancelled, setCancelled] = useState(false)

    const effectiveStatus = cancelled
        ? { ...subscriptionStatus, status: 'cancelled' as const }
        : subscriptionStatus

    const isCurrentTier = effectiveStatus.tierId === tier.id
    const perks: PerkItem[] = tier.perks || []

    const handleSubscribe = () => {
        if (!effectiveStatus.isAuthenticated) {
            window.location.href = `/account/login?next=${encodeURIComponent(`/${partner.slug}/membership/${tier.id}`)}`
            return
        }
        setIsLoading(true)
        startTransition(async () => {
            const result = await initiateSubscriptionCheckout(tier.id)
            setIsLoading(false)
            if (result.error) {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            } else if (result.checkoutUrl) {
                window.location.href = result.checkoutUrl
            }
        })
    }

    const handleCancel = () => {
        if (!confirm('Cancel your subscription? You keep access until the end of your current period.')) return
        if (!effectiveStatus.subscriptionId) return
        startTransition(async () => {
            const result = await cancelSubscription(effectiveStatus.subscriptionId!)
            if (result.error) {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            } else {
                setCancelled(true)
                toast({ title: 'Subscription cancelled', description: 'You keep access until your period ends.' })
            }
        })
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Hero */}
            <div className="relative h-64 sm:h-80 w-full overflow-hidden bg-gradient-to-br from-primary/30 via-primary/10 to-background">
                {tier.image_url ? (
                    <Image src={tier.image_url} alt={tier.name} fill className="object-cover" priority />
                ) : partner.cover_image_url ? (
                    <Image src={partner.cover_image_url} alt={partner.business_name} fill className="object-cover" priority />
                ) : (
                    <Crown className="absolute -right-6 -top-6 h-56 w-56 text-primary/10 rotate-12" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />

                {/* Partner avatar + back nav in hero */}
                <div className="absolute top-4 left-4 flex items-center gap-3">
                    {partner.profile_photo_url && (
                        <Image
                            src={partner.profile_photo_url}
                            alt={partner.business_name}
                            width={36}
                            height={36}
                            className="rounded-full border-2 border-background object-cover"
                        />
                    )}
                    <div className="flex items-center gap-3 text-sm">
                        <Link
                            href={`/${partner.slug}/membership`}
                            className="text-white/80 hover:text-white transition-colors flex items-center gap-1 drop-shadow"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            All tiers
                        </Link>
                        <span className="text-white/40">·</span>
                        <Link
                            href={`/${partner.slug}`}
                            className="text-white/80 hover:text-white transition-colors drop-shadow"
                        >
                            {partner.business_name}
                        </Link>
                    </div>
                </div>
            </div>

            <div className="container mx-auto px-4 py-8 max-w-5xl">
                {/* Mobile: subscribe button at TOP before content */}
                <div className="lg:hidden mb-8">
                    <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-3xl font-bold">{tier.name}</h1>
                                {isCurrentTier && <Badge variant="default">Current</Badge>}
                            </div>
                            <p className="text-4xl font-bold text-primary mt-1">
                                ₱{Number(tier.price_monthly).toLocaleString()}
                                <span className="text-base font-normal text-muted-foreground">/mo</span>
                            </p>
                        </div>
                    </div>
                    <SubscribeButton
                        tier={tier}
                        isCurrentTier={isCurrentTier}
                        isPending={isPending}
                        isLoading={isLoading}
                        onSubscribe={handleSubscribe}
                        onCancel={handleCancel}
                        status={effectiveStatus.status}
                        currentPeriodEnd={effectiveStatus.currentPeriodEnd}
                        size="lg"
                    />
                </div>

                {/* Desktop: two-column layout */}
                <div className="flex gap-12">
                    {/* Left — scrollable content */}
                    <div className="flex-1 min-w-0 space-y-8">
                        {/* Title (desktop only) */}
                        <div className="hidden lg:block">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                <h1 className="text-3xl font-bold">{tier.name}</h1>
                                {isCurrentTier && <Badge variant="default">Current</Badge>}
                            </div>
                            {tier.description && (
                                <p className="text-muted-foreground mt-1">{tier.description}</p>
                            )}
                        </div>

                        {/* Short description (mobile) */}
                        {tier.description && (
                            <p className="lg:hidden text-muted-foreground -mt-4">{tier.description}</p>
                        )}

                        {/* Long description */}
                        {tier.long_description && (
                            <div
                                className="prose prose-sm dark:prose-invert max-w-none"
                                dangerouslySetInnerHTML={{ __html: tier.long_description }}
                            />
                        )}

                        {/* Perks */}
                        {perks.length > 0 && (
                            <section className="space-y-3">
                                <h2 className="text-lg font-semibold">What&apos;s included</h2>
                                <div className="space-y-3">
                                    {perks.map((perk, i) => {
                                        const Icon = PERK_ICONS[perk.type] ?? Gift
                                        const claimInfo = PERK_CLAIM_INFO[perk.type]
                                        return (
                                            <div key={i} className="flex items-start gap-4 p-4 rounded-xl border bg-muted/30">
                                                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                                                    <Icon className="h-5 w-5 text-primary" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-semibold">{perk.label}</p>
                                                    {perk.description && (
                                                        <p className="text-sm text-muted-foreground mt-0.5">{perk.description}</p>
                                                    )}
                                                    {claimInfo && (
                                                        <p className="text-xs text-muted-foreground mt-1 italic">{claimInfo}</p>
                                                    )}
                                                    {perk.claim_frequency && perk.claim_frequency !== 'unlimited' && (
                                                        <Badge variant="outline" className="text-xs mt-1.5">
                                                            {perk.claim_frequency === 'once' ? 'One-time' : 'Monthly'}
                                                        </Badge>
                                                    )}
                                                    {perk.url && (
                                                        <a
                                                            href={perk.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-xs text-primary hover:underline mt-1 block"
                                                        >
                                                            {perk.url}
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </section>
                        )}
                    </div>

                    {/* Right — sticky sidebar (desktop only) */}
                    <div className="hidden lg:block w-72 shrink-0">
                        <div className="sticky top-8 rounded-2xl border p-6 space-y-4">
                            <div>
                                <p className="text-4xl font-bold text-primary">
                                    ₱{Number(tier.price_monthly).toLocaleString()}
                                    <span className="text-base font-normal text-muted-foreground">/mo</span>
                                </p>
                                <p className="text-sm text-muted-foreground mt-0.5">{tier.name} membership</p>
                            </div>

                            <SubscribeButton
                                tier={tier}
                                isCurrentTier={isCurrentTier}
                                isPending={isPending}
                                isLoading={isLoading}
                                onSubscribe={handleSubscribe}
                                onCancel={handleCancel}
                                status={effectiveStatus.status}
                                currentPeriodEnd={effectiveStatus.currentPeriodEnd}
                                size="lg"
                            />

                            {/* Perks summary */}
                            {perks.length > 0 && (
                                <ul className="space-y-1.5 pt-1 border-t">
                                    {perks.map((perk, i) => {
                                        const Icon = PERK_ICONS[perk.type] ?? Gift
                                        return (
                                            <li key={i} className="flex items-center gap-2 text-sm">
                                                <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                                                <span>{perk.label}</span>
                                            </li>
                                        )
                                    })}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
