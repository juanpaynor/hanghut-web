'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import {
    Crown, Check, Loader2, ArrowLeft, Lock, ExternalLink, ArrowRight,
    Package, Megaphone, Zap, Download, Link2, Gift, Star, MessageCircle,
} from 'lucide-react'
import { YourPerks } from '@/components/storefront/your-perks'
import { PayrexCheckoutModal } from '@/components/storefront/payrex-checkout-modal'
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
    subscriber_chat:  MessageCircle,
    custom:           Star,
}

const PERK_AUTO_LABEL: Record<string, string> = {
    gated_posts:      'Exclusive posts',
    early_access:     'Early ticket access',
    digital_download: 'Digital download',
    community_link:   'Private community',
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
    description: string | null
    profile_photo_url: string | null
    cover_image_url: string | null
}

interface Post {
    id: string
    title: string
    body: string
    published_at: string
    gated_url: string | null
    gated_url_label: string | null
    subscription_tiers: { name: string } | null
}

interface Props {
    partner: Partner
    tiers: Tier[]
    posts: Post[]
    subscriptionStatus: SubscriptionStatus
    subscriptionId?: string | null
    subscriberGroupId?: string | null
    existingClaims?: { perk_type: string; claim_period: string; status: string }[]
    fontClass?: string
    themeStyle?: React.CSSProperties
}

export function MembershipPage({ partner, tiers, posts, subscriptionStatus, subscriptionId, subscriberGroupId, existingClaims = [], fontClass, themeStyle }: Props) {
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()
    const [loadingTierId, setLoadingTierId] = useState<string | null>(null)
    const [cancelled, setCancelled] = useState(false)
    const [checkoutModal, setCheckoutModal] = useState<{
        clientSecret: string
        publicKey: string
        tierName: string
        priceMonthly: number
    } | null>(null)

    const effectiveStatus = cancelled
        ? { ...subscriptionStatus, status: 'cancelled' as const, isActive: true }
        : subscriptionStatus

    const handleSubscribe = (tierId: string) => {
        if (!effectiveStatus.isAuthenticated) {
            window.location.href = `/account/login?next=${encodeURIComponent(`/${partner.slug}/membership`)}`
            return
        }
        const tier = tiers.find(t => t.id === tierId)
        setLoadingTierId(tierId)
        startTransition(async () => {
            const result = await initiateSubscriptionCheckout(tierId)
            setLoadingTierId(null)
            if ('error' in result && result.error) {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            } else if ('client_secret' in result && result.client_secret) {
                setCheckoutModal({
                    clientSecret: result.client_secret,
                    publicKey: result.public_key,
                    tierName: tier?.name ?? '',
                    priceMonthly: tier?.price_monthly ?? 0,
                })
            }
        })
    }

    const handleCancel = (subscriptionId: string) => {
        if (!confirm('Cancel your subscription? You keep access until the end of your current period.')) return
        startTransition(async () => {
            const result = await cancelSubscription(subscriptionId)
            if (result.error) {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            } else {
                setCancelled(true)
                toast({ title: 'Subscription cancelled', description: 'You keep access until your period ends.' })
            }
        })
    }

    return (
        <>
        <div className={`min-h-screen bg-background${fontClass ? ` ${fontClass}` : ''}`} style={themeStyle}>
            {/* Cover + Header */}
            <div className="relative h-52 sm:h-72 w-full overflow-hidden bg-gradient-to-br from-primary/30 via-primary/10 to-background">
                {partner.cover_image_url ? (
                    <Image
                        src={partner.cover_image_url}
                        alt={partner.business_name}
                        fill
                        className="object-cover"
                        priority
                    />
                ) : (
                    <Crown className="absolute -right-6 -top-6 h-48 w-48 text-primary/10 rotate-12" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-6 flex items-end gap-4">
                    {partner.profile_photo_url && (
                        <Image
                            src={partner.profile_photo_url}
                            alt={partner.business_name}
                            width={72}
                            height={72}
                            className="rounded-full border-4 border-background object-cover shrink-0"
                        />
                    )}
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{partner.business_name}</h1>
                            <Badge variant="secondary" className="gap-1 shrink-0">
                                <Crown className="h-3 w-3" /> Membership
                            </Badge>
                        </div>
                        {partner.description && (
                            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{partner.description}</p>
                        )}
                    </div>
                </div>
            </div>

            <div className="container mx-auto px-4 py-10 max-w-4xl">
                {/* Back link */}
                <Link
                    href={`/${partner.slug}`}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to {partner.business_name}
                </Link>

                {/* Active subscription banner */}
                {effectiveStatus.isActive && (
                    <div className="flex items-center justify-between gap-3 p-4 rounded-xl bg-primary/10 border border-primary/20 mb-8 flex-wrap">
                        <div className="flex items-center gap-3">
                            <Crown className="h-5 w-5 text-primary shrink-0" />
                            <div>
                                <p className="font-semibold text-sm">You&apos;re subscribed — {effectiveStatus.tierName}</p>
                                {effectiveStatus.currentPeriodEnd && (
                                    <p className="text-xs text-muted-foreground">
                                        {effectiveStatus.status === 'cancelled'
                                            ? `Access until ${format(new Date(effectiveStatus.currentPeriodEnd), 'MMMM d, yyyy')}`
                                            : `Renews ${format(new Date(effectiveStatus.currentPeriodEnd), 'MMMM d, yyyy')}`}
                                    </p>
                                )}
                            </div>
                        </div>
                        {effectiveStatus.status !== 'cancelled' && effectiveStatus.tierId && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground text-xs shrink-0"
                                disabled={isPending}
                                onClick={() => handleCancel(effectiveStatus.subscriptionId!)}
                            >
                                Cancel membership
                            </Button>
                        )}
                    </div>
                )}

                {/* Your Perks — only for active subscribers */}
                {effectiveStatus.isActive && subscriptionId && subscriptionStatus.tierId && (() => {
                    const activeTier = tiers.find(t => t.id === subscriptionStatus.tierId)
                    if (!activeTier?.perks?.length) return null
                    return (
                        <YourPerks
                            tierId={activeTier.id}
                            subscriptionId={subscriptionId}
                            partnerId={partner.id}
                            partnerName={partner.business_name}
                            perks={activeTier.perks as any}
                            existingClaims={existingClaims}
                            subscriberGroupId={subscriberGroupId}
                        />
                    )
                })()}

                {tiers.length === 0 ? (
                    <div className="text-center py-20 text-muted-foreground">
                        <Crown className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p className="font-semibold">No membership tiers available yet</p>
                        <p className="text-sm mt-1">Check back soon.</p>
                    </div>
                ) : (
                    <div className="flex flex-wrap justify-center gap-6">
                        {tiers.map(tier => {
                            const isCurrentTier = effectiveStatus.tierId === tier.id
                            const isLoading = loadingTierId === tier.id && isPending
                            const perks: PerkItem[] = tier.perks || []

                            return (
                                <div
                                    key={tier.id}
                                    className={`w-full sm:w-[340px] rounded-2xl border flex flex-col overflow-hidden transition-shadow hover:shadow-md ${isCurrentTier ? 'border-primary ring-1 ring-primary' : 'border-border'}`}
                                >
                                    {/* Tier cover image */}
                                    {tier.image_url ? (
                                        <div className="relative h-36 w-full overflow-hidden bg-muted">
                                            <Image
                                                src={tier.image_url}
                                                alt={tier.name}
                                                fill
                                                className="object-cover"
                                            />
                                        </div>
                                    ) : (
                                        <div className="h-36 w-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                                            <Crown className="h-10 w-10 text-primary/30" />
                                        </div>
                                    )}

                                    <div className="p-5 flex flex-col flex-1 gap-4">
                                        {/* Name + price */}
                                        <div>
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <h2 className="font-bold text-lg leading-tight">{tier.name}</h2>
                                                {isCurrentTier && (
                                                    <Badge variant="default" className="text-xs shrink-0">Current</Badge>
                                                )}
                                            </div>
                                            <p className="text-3xl font-bold text-primary">
                                                ₱{Number(tier.price_monthly).toLocaleString()}
                                                <span className="text-sm font-normal text-muted-foreground">/mo</span>
                                            </p>
                                        </div>

                                        {/* Short description */}
                                        {tier.description && (
                                            <p className="text-sm text-muted-foreground">{tier.description}</p>
                                        )}

                                        {/* Long description (rich HTML from Tiptap) */}
                                        {tier.long_description && (
                                            <div
                                                className="prose prose-sm dark:prose-invert max-w-none text-sm text-muted-foreground"
                                                dangerouslySetInnerHTML={{ __html: tier.long_description }}
                                            />
                                        )}

                                        {/* Perks list */}
                                        {perks.length > 0 && (
                                            <ul className="space-y-2 flex-1">
                                                {perks.map((perk, i) => {
                                                    const Icon = PERK_ICONS[perk.type] ?? Gift
                                                    return (
                                                        <li key={i} className="flex items-start gap-2 text-sm">
                                                            <Icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                                                            <span>
                                                                <span className="font-medium">{perk.label}</span>
                                                                {perk.description && (
                                                                    <span className="text-muted-foreground"> — {perk.description}</span>
                                                                )}
                                                            </span>
                                                        </li>
                                                    )
                                                })}
                                            </ul>
                                        )}

                                        {/* CTAs */}
                                        <div className="mt-auto space-y-2">
                                            <Button
                                                className="w-full"
                                                variant={isCurrentTier ? 'secondary' : 'default'}
                                                disabled={isCurrentTier || isPending}
                                                onClick={() => !isCurrentTier && handleSubscribe(tier.id)}
                                            >
                                                {isLoading ? (
                                                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</>
                                                ) : isCurrentTier ? (
                                                    <><Check className="h-4 w-4 mr-2" />Current Plan</>
                                                ) : effectiveStatus.isAuthenticated ? (
                                                    `Subscribe — ₱${Number(tier.price_monthly).toLocaleString()}/mo`
                                                ) : (
                                                    'Join now'
                                                )}
                                            </Button>
                                            <Link
                                                href={`/${partner.slug}/membership/${tier.id}`}
                                                className="flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
                                            >
                                                Learn more
                                                <ArrowRight className="h-3.5 w-3.5" />
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* ── Exclusive Posts ── */}
                {posts.length > 0 && (
                    <section className="mt-14 space-y-4">
                        <div className="flex items-center gap-3">
                            <Lock className="h-5 w-5 text-primary" />
                            <h2 className="text-2xl font-bold">Exclusive Posts</h2>
                            {!effectiveStatus.isActive && (
                                <Badge variant="outline" className="text-xs">Members only</Badge>
                            )}
                        </div>

                        <div className="space-y-3">
                            {posts.map(post => {
                                const canRead = effectiveStatus.isActive
                                return (
                                    <div key={post.id} className="rounded-xl border p-5 space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="font-semibold">{post.title}</p>
                                            {post.subscription_tiers?.name && (
                                                <Badge variant="outline" className="text-xs shrink-0">
                                                    <Crown className="h-3 w-3 mr-1" />
                                                    {post.subscription_tiers.name}
                                                </Badge>
                                            )}
                                        </div>

                                        {canRead ? (
                                            <>
                                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{post.body}</p>
                                                {post.gated_url && (
                                                    <a
                                                        href={post.gated_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline mt-1"
                                                    >
                                                        <ExternalLink className="h-4 w-4" />
                                                        {post.gated_url_label || 'View link'}
                                                    </a>
                                                )}
                                            </>
                                        ) : (
                                            <div className="relative">
                                                <p className="text-sm text-muted-foreground line-clamp-2 blur-sm select-none">
                                                    {post.body}
                                                </p>
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <div className="flex items-center gap-2 bg-card/90 backdrop-blur-sm border border-border rounded-full px-3 py-1.5 text-xs font-medium">
                                                        <Lock className="h-3 w-3" />
                                                        Subscribe to {partner.business_name} to read
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <p className="text-xs text-muted-foreground">
                                            {format(new Date(post.published_at), 'MMM d, yyyy')}
                                        </p>
                                    </div>
                                )
                            })}
                        </div>
                    </section>
                )}
            </div>
        </div>

        {checkoutModal && (
            <PayrexCheckoutModal
                open={!!checkoutModal}
                onClose={() => setCheckoutModal(null)}
                clientSecret={checkoutModal.clientSecret}
                publicKey={checkoutModal.publicKey}
                tierName={checkoutModal.tierName}
                priceMonthly={checkoutModal.priceMonthly}
                partnerSlug={partner.slug}
            />
        )}
        </>
    )
}
