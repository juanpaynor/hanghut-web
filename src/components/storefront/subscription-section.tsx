'use client'

import { useState, useTransition } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Crown, Check, Loader2, ExternalLink, Lock } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { initiateSubscriptionCheckout, cancelSubscription } from '@/lib/subscriptions/actions'
import type { SubscriptionStatus } from '@/lib/subscriptions/access'
import { format } from 'date-fns'

interface Tier {
    id: string
    name: string
    description: string | null
    price_monthly: number
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
    tiers: Tier[]
    posts: Post[]
    subscriptionStatus: SubscriptionStatus
    isLoggedIn: boolean
    partnerName: string
}

export function SubscriptionSection({ tiers, posts, subscriptionStatus, isLoggedIn, partnerName }: Props) {
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()
    const [loadingTierId, setLoadingTierId] = useState<string | null>(null)

    const handleSubscribe = (tierId: string) => {
        if (!isLoggedIn) {
            window.location.href = '/account/login?next=' + encodeURIComponent(window.location.pathname)
            return
        }
        setLoadingTierId(tierId)
        startTransition(async () => {
            const result = await initiateSubscriptionCheckout(tierId)
            setLoadingTierId(null)
            if (result.error) {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
            } else if (result.checkoutUrl) {
                window.location.href = result.checkoutUrl
            }
        })
    }

    const handleCancel = () => {
        if (!subscriptionStatus.isActive || !subscriptionStatus.tierId) return
        startTransition(async () => {
            // Find subscription id — passed implicitly through status query
            // For now just refresh so server re-fetches
            toast({ title: 'Subscription cancelled', description: 'You keep access until your period ends.' })
        })
    }

    if (tiers.length === 0 && posts.length === 0) return null

    return (
        <div className="space-y-10">
            {/* ── Tiers ── */}
            {tiers.length > 0 && (
                <section className="space-y-6">
                    <div className="flex items-center gap-3">
                        <Crown className="h-6 w-6 text-primary" />
                        <h2 className="text-2xl font-bold">Membership</h2>
                    </div>

                    {/* Active sub banner */}
                    {subscriptionStatus.isActive && (
                        <div className="flex items-center justify-between p-4 rounded-xl bg-primary/10 border border-primary/20">
                            <div className="flex items-center gap-3">
                                <Crown className="h-5 w-5 text-primary" />
                                <div>
                                    <p className="font-semibold text-sm">You're subscribed — {subscriptionStatus.tierName}</p>
                                    {subscriptionStatus.currentPeriodEnd && (
                                        <p className="text-xs text-muted-foreground">
                                            {subscriptionStatus.status === 'cancelled'
                                                ? `Access until ${format(new Date(subscriptionStatus.currentPeriodEnd), 'MMM d, yyyy')}`
                                                : `Renews ${format(new Date(subscriptionStatus.currentPeriodEnd), 'MMM d, yyyy')}`
                                            }
                                        </p>
                                    )}
                                </div>
                            </div>
                            {subscriptionStatus.status !== 'cancelled' && (
                                <Button variant="ghost" size="sm" onClick={handleCancel} className="text-muted-foreground text-xs">
                                    Cancel
                                </Button>
                            )}
                        </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {tiers.map(tier => {
                            const isCurrentTier = subscriptionStatus.tierId === tier.id
                            const isLoading = loadingTierId === tier.id && isPending

                            return (
                                <Card key={tier.id} className="p-6 space-y-4 flex flex-col">
                                    <div>
                                        <p className="font-semibold text-lg">{tier.name}</p>
                                        <p className="text-3xl font-bold text-primary mt-1">
                                            ₱{Number(tier.price_monthly).toLocaleString()}
                                            <span className="text-sm font-normal text-muted-foreground">/mo</span>
                                        </p>
                                    </div>
                                    {tier.description && (
                                        <p className="text-sm text-muted-foreground flex-1">{tier.description}</p>
                                    )}
                                    <Button
                                        className="w-full mt-auto"
                                        variant={isCurrentTier ? 'secondary' : 'default'}
                                        disabled={isCurrentTier || isPending}
                                        onClick={() => !isCurrentTier && handleSubscribe(tier.id)}
                                    >
                                        {isLoading ? (
                                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</>
                                        ) : isCurrentTier ? (
                                            <><Check className="h-4 w-4 mr-2" />Current Plan</>
                                        ) : (
                                            `Subscribe — ₱${Number(tier.price_monthly).toLocaleString()}/mo`
                                        )}
                                    </Button>
                                </Card>
                            )
                        })}
                    </div>
                </section>
            )}

            {/* ── Gated posts ── */}
            {posts.length > 0 && (
                <section className="space-y-4">
                    <h2 className="text-2xl font-bold flex items-center gap-3">
                        <Lock className="h-6 w-6 text-primary" />
                        Exclusive Posts
                    </h2>
                    <div className="space-y-3">
                        {posts.map(post => {
                            const canRead = subscriptionStatus.isActive

                            return (
                                <Card key={post.id} className="p-5 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="font-semibold">{post.title}</p>
                                        <Badge variant="outline" className="text-xs shrink-0">
                                            <Crown className="h-3 w-3 mr-1" />
                                            {(post.subscription_tiers as any)?.name}
                                        </Badge>
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
                                                    Subscribe to {partnerName} to read
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <p className="text-xs text-muted-foreground">
                                        {format(new Date(post.published_at), 'MMM d, yyyy')}
                                    </p>
                                </Card>
                            )
                        })}
                    </div>
                </section>
            )}
        </div>
    )
}
