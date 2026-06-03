import Link from 'next/link'
import { Crown, ArrowRight, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { SubscriptionStatus } from '@/lib/subscriptions/access'

interface Tier {
    id: string
    name: string
    price_monthly: number
}

interface Props {
    tiers: Tier[]
    postCount: number
    subscriptionStatus: SubscriptionStatus
    partnerName: string
    partnerSlug: string
}

/**
 * Storefront membership TEASER. Shows a compact promo that links to the
 * full /{slug}/membership page — no inline subscribe, no gated posts here.
 * The membership page owns the full tier detail + subscribe flow + posts.
 */
export function SubscriptionSection({ tiers, postCount, subscriptionStatus, partnerName, partnerSlug }: Props) {
    if (tiers.length === 0) return null

    const isMember = subscriptionStatus.isActive
    const lowestPrice = Math.min(...tiers.map(t => Number(t.price_monthly)))

    return (
        <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-3 max-w-2xl">
                    <div className="flex items-center gap-2.5 flex-wrap">
                        <Crown className="h-6 w-6 text-primary" />
                        <h2 className="text-2xl font-bold">Membership</h2>
                        {isMember && (
                            <Badge variant="default" className="gap-1">
                                <Crown className="h-3 w-3" /> Member
                            </Badge>
                        )}
                    </div>

                    <p className="text-muted-foreground">
                        {isMember ? (
                            <>You&apos;re subscribed to <span className="font-medium text-foreground">{subscriptionStatus.tierName}</span>. Manage your membership and view exclusive content.</>
                        ) : (
                            <>Join {partnerName} from <span className="font-semibold text-foreground">₱{lowestPrice.toLocaleString()}/mo</span> and unlock exclusive perks, early access, and members-only content.</>
                        )}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        {tiers.slice(0, 4).map(tier => (
                            <Badge key={tier.id} variant="outline" className="font-normal">
                                {tier.name} · ₱{Number(tier.price_monthly).toLocaleString()}/mo
                            </Badge>
                        ))}
                        {postCount > 0 && !isMember && (
                            <Badge variant="secondary" className="gap-1 font-normal">
                                <Lock className="h-3 w-3" />
                                {postCount} members-only post{postCount === 1 ? '' : 's'}
                            </Badge>
                        )}
                    </div>
                </div>

                <Button asChild size="lg" className="shrink-0">
                    <Link href={`/${partnerSlug}/membership`}>
                        {isMember ? 'Manage membership' : 'View membership'}
                        <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                </Button>
            </div>
        </section>
    )
}
