'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Minus, Plus, Loader2, Check, Star, Crown, Ticket } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fireConfetti } from '@/lib/utils/confetti'
import { trackEventInteraction } from '@/lib/analytics/track-event'

interface SubscriberDiscount {
    has_discount: boolean
    discount_type?: 'fixed_price' | 'percentage'
    discount_value?: number
    original_price?: number
    discounted_price?: number
    max_tickets?: number
}

export interface TierDisplayConfig {
    inline?: boolean
    display?: 'cards' | 'list'
    show_remaining?: boolean
    show_sold_out?: boolean
}

interface InlineTierListProps {
    eventId: string
    ticketPrice: number
    minTickets?: number
    maxTickets?: number
    isSoldOut: boolean
    tiers?: any[]
    fullWidth?: boolean
    subscriberDiscount?: SubscriberDiscount | null
    display?: TierDisplayConfig
}

/**
 * Inline tier presentation for the event page — every tier is shown on the page
 * (name, perks, price, optional "N left"), the buyer picks one + a quantity, and
 * we go straight to checkout. Replaces the "Get Tickets → modal → pick tier" flow
 * when the organizer enables inline display. Honors per-tier presentation
 * (highlight, badge_label, accent_color, perks) set in the tier editor.
 */
export function InlineTierList({
    eventId,
    ticketPrice,
    minTickets = 1,
    maxTickets = 10,
    isSoldOut,
    tiers = [],
    fullWidth = false,
    subscriberDiscount = null,
    display,
}: InlineTierListProps) {
    const router = useRouter()
    const reduce = useReducedMotion()
    // Subtle, reduced-motion-aware entrance: cards stagger in; disabled entirely
    // when the viewer prefers reduced motion (no transforms, no delay).
    const container = {
        hidden: {},
        show: { transition: { staggerChildren: reduce ? 0 : 0.05 } },
    }
    const item = reduce
        ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
        : {
            hidden: { opacity: 0, y: 10 },
            show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 320, damping: 26 } },
        }
    const showRemaining = display?.show_remaining ?? false
    const showSoldOut = display?.show_sold_out ?? true
    const asList = display?.display === 'list'

    const soldOutOf = (t: any) => Number(t.quantity_sold) >= Number(t.quantity_total)

    // Active tiers, sorted; optionally drop sold-out ones.
    const activeTiers = useMemo(() => {
        let list = (tiers || []).filter((t: any) => t.is_active !== false)
        if (!showSoldOut) list = list.filter((t: any) => !soldOutOf(t))
        return list.sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0) || a.price - b.price)
    }, [tiers, showSoldOut])

    // Default selection = first tier that isn't sold out.
    const firstSelectable = activeTiers.find((t: any) => !soldOutOf(t)) || activeTiers[0] || null
    const [selectedTierId, setSelectedTierId] = useState<string | null>(firstSelectable?.id ?? null)
    const [quantity, setQuantity] = useState(minTickets)
    const [isLoading, setIsLoading] = useState(false)

    const selectedTier = activeTiers.find((t: any) => t.id === selectedTierId)
    const effectivePrice = selectedTier ? Number(selectedTier.price) : ticketPrice
    const effectiveMin = selectedTier?.min_per_order || minTickets
    const effectiveMax = selectedTier?.max_per_order || maxTickets
    const selectedSoldOut = isSoldOut || (selectedTier ? soldOutOf(selectedTier) : false)

    const selectTier = (t: any) => {
        if (soldOutOf(t)) return
        setSelectedTierId(t.id)
        setQuantity(t.min_per_order || minTickets)
    }

    const handleCheckout = () => {
        setIsLoading(true)
        fireConfetti()
        trackEventInteraction(eventId, 'get_tickets')
        const params = new URLSearchParams()
        params.set('eventId', eventId)
        params.set('quantity', quantity.toString())
        if (selectedTierId) params.set('tierId', selectedTierId)
        router.push(`/checkout?${params.toString()}`)
    }

    const money = (n: number) => (n === 0 ? 'Free' : `₱${n.toLocaleString()}`)

    // ── No tiers configured → single general-admission price ──────────────────
    const hasTiers = activeTiers.length > 0

    return (
        <div className="space-y-5">
            {hasTiers ? (
                <motion.div
                    className={cn(asList ? 'space-y-2' : 'grid gap-3 sm:grid-cols-2')}
                    variants={container}
                    initial="hidden"
                    animate="show"
                >
                    {activeTiers.map((tier: any) => {
                        const tSoldOut = soldOutOf(tier)
                        const selected = selectedTierId === tier.id
                        const accent = tier.accent_color as string | undefined
                        const remaining = Math.max(Number(tier.quantity_total) - Number(tier.quantity_sold), 0)
                        const perks: string[] = Array.isArray(tier.perks) ? tier.perks : []
                        return (
                            <motion.button
                                type="button"
                                key={tier.id}
                                variants={item}
                                whileTap={reduce || tSoldOut ? undefined : { scale: 0.985 }}
                                onClick={() => selectTier(tier)}
                                disabled={tSoldOut}
                                aria-pressed={selected}
                                style={selected && accent ? { borderColor: accent } : undefined}
                                className={cn(
                                    'group relative text-left rounded-xl border-2 p-4 transition-colors',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                                    tSoldOut ? 'opacity-55 cursor-not-allowed' : 'cursor-pointer hover:border-primary/50',
                                    selected ? 'border-primary bg-primary/5' : 'border-border',
                                    tier.highlight && !selected && 'ring-1 ring-primary/30',
                                    asList && 'flex items-center justify-between gap-4'
                                )}
                            >
                                {/* Featured / badge ribbon */}
                                {(tier.highlight || tier.badge_label) && (
                                    <div className={cn('mb-2 flex items-center gap-2', asList && 'mb-0 order-2')}>
                                        {tier.highlight && (
                                            <Badge className="gap-1 text-[10px] h-5" style={accent ? { backgroundColor: accent } : undefined}>
                                                <Star className="h-3 w-3" /> {tier.badge_label || 'Featured'}
                                            </Badge>
                                        )}
                                        {!tier.highlight && tier.badge_label && (
                                            <Badge variant="outline" className="text-[10px] h-5" style={accent ? { borderColor: accent, color: accent } : undefined}>
                                                {tier.badge_label}
                                            </Badge>
                                        )}
                                    </div>
                                )}

                                {/* Tier image — full-width banner in card mode */}
                                {tier.image_url && !asList && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={tier.image_url} alt="" className="mb-3 h-32 w-full rounded-lg object-cover" />
                                )}

                                <div className={cn(asList && 'flex-1 order-1')}>
                                    <div className="flex items-center gap-2">
                                        {tier.image_url && asList && (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={tier.image_url} alt="" className="h-9 w-9 rounded-md object-cover shrink-0" />
                                        )}
                                        {accent && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: accent }} />}
                                        <span className="font-bold">{tier.name}</span>
                                        {tSoldOut && <Badge variant="destructive" className="text-[10px] h-5">Sold Out</Badge>}
                                    </div>
                                    {tier.description && (
                                        <p className="mt-1 text-sm text-muted-foreground">{tier.description}</p>
                                    )}
                                    {perks.length > 0 && !asList && (
                                        <ul className="mt-3 space-y-1.5">
                                            {perks.map((perk, i) => (
                                                <li key={i} className="flex items-start gap-2 text-sm">
                                                    <Check className="mt-0.5 h-3.5 w-3.5 text-green-600 shrink-0" style={accent ? { color: accent } : undefined} />
                                                    <span className="text-muted-foreground">{perk}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {showRemaining && !tSoldOut && remaining <= 20 && (
                                        <p className="mt-2 text-xs font-medium text-amber-600">Only {remaining} left</p>
                                    )}
                                </div>

                                <div className={cn('mt-3', asList && 'mt-0 order-3 text-right shrink-0')}>
                                    <span className="text-lg font-extrabold" style={accent && selected ? { color: accent } : undefined}>
                                        {money(Number(tier.price))}
                                    </span>
                                    {/* Selected check */}
                                    {selected && !asList && (
                                        <motion.span
                                            initial={reduce ? false : { scale: 0 }}
                                            animate={{ scale: 1 }}
                                            transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                                            className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                                        >
                                            <Check className="h-3 w-3" />
                                        </motion.span>
                                    )}
                                </div>
                            </motion.button>
                        )
                    })}
                </motion.div>
            ) : (
                <div className="flex items-center justify-between rounded-xl border p-4">
                    <span className="font-semibold">General Admission</span>
                    <span className="text-lg font-extrabold">{money(ticketPrice)}</span>
                </div>
            )}

            {/* Subscriber discount note */}
            {subscriberDiscount?.has_discount && (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-sm">
                    <Crown className="h-4 w-4 text-primary shrink-0" />
                    <span>
                        <span className="font-semibold text-primary">Subscriber price: </span>
                        {subscriberDiscount.discount_type === 'fixed_price'
                            ? `₱${Number(subscriberDiscount.discounted_price).toLocaleString()}`
                            : `${subscriberDiscount.discount_value}% off`}{' '}
                        <span className="text-muted-foreground text-xs">(applied at checkout)</span>
                    </span>
                </div>
            )}

            {/* Quantity + checkout bar */}
            <div className="rounded-xl border bg-muted/30 p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Quantity</span>
                    <div className="flex items-center gap-4">
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-full"
                            onClick={() => setQuantity(q => Math.max(effectiveMin, q - 1))}
                            disabled={quantity <= effectiveMin || selectedSoldOut}
                        >
                            <Minus className="h-3 w-3" />
                        </Button>
                        <span className="font-bold w-4 text-center">{quantity}</span>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-full"
                            onClick={() => setQuantity(q => Math.min(effectiveMax, q + 1))}
                            disabled={quantity >= effectiveMax || selectedSoldOut}
                        >
                            <Plus className="h-3 w-3" />
                        </Button>
                    </div>
                </div>

                <div className="flex items-center justify-between border-t pt-3 font-bold">
                    <span>Total</span>
                    <span className="text-lg">{money(effectivePrice * quantity)}</span>
                </div>

                <Button
                    className={cn('bg-primary', fullWidth ? 'w-full' : 'w-full')}
                    size="lg"
                    onClick={handleCheckout}
                    disabled={isLoading || selectedSoldOut || !selectedTierId && hasTiers}
                >
                    {isLoading ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…</>
                    ) : selectedSoldOut ? (
                        'Sold Out'
                    ) : (
                        <><Ticket className="mr-2 h-5 w-5" /> Proceed to Checkout</>
                    )}
                </Button>
            </div>
        </div>
    )
}
