'use client'

import { useState, useTransition } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { Crown, Percent, DollarSign, Trash2, Plus, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { upsertEventDiscount, deleteEventDiscount } from '@/lib/subscriptions/actions'

export interface SubscriptionTierBasic {
    id: string
    name: string
    price_monthly: number
    is_active: boolean
}

export interface ExistingDiscount {
    subscription_tier_id: string
    discount_type: 'fixed_price' | 'percentage'
    discount_value: number
    max_tickets: number
}

interface DiscountRow {
    tierId: string
    tierName: string
    tierPrice: number
    enabled: boolean
    discountType: 'fixed_price' | 'percentage'
    discountValue: string
    maxTickets: string
    saving: boolean
}

interface Props {
    eventId: string
    subscriptionTiers: SubscriptionTierBasic[]
    existingDiscounts: ExistingDiscount[]
}

export function SubscriberDiscountsSection({ eventId, subscriptionTiers, existingDiscounts }: Props) {
    const { toast } = useToast()
    const [, startTransition] = useTransition()

    const activeTiers = subscriptionTiers.filter(t => t.is_active)

    const buildRows = (): DiscountRow[] =>
        activeTiers.map(tier => {
            const existing = existingDiscounts.find(d => d.subscription_tier_id === tier.id)
            return {
                tierId: tier.id,
                tierName: tier.name,
                tierPrice: tier.price_monthly,
                enabled: !!existing,
                discountType: existing?.discount_type ?? 'percentage',
                discountValue: existing ? String(existing.discount_value) : '',
                maxTickets: existing ? String(existing.max_tickets) : '1',
                saving: false,
            }
        })

    const [rows, setRows] = useState<DiscountRow[]>(buildRows)

    const update = (tierId: string, patch: Partial<DiscountRow>) =>
        setRows(prev => prev.map(r => r.tierId === tierId ? { ...r, ...patch } : r))

    const handleToggle = (tierId: string, enabled: boolean) => {
        if (!enabled) {
            // Removing discount — delete immediately
            update(tierId, { saving: true })
            startTransition(async () => {
                const result = await deleteEventDiscount(eventId, tierId)
                if (result.error) {
                    toast({ title: 'Error', description: result.error, variant: 'destructive' })
                    update(tierId, { saving: false })
                } else {
                    update(tierId, { enabled: false, discountValue: '', maxTickets: '1', saving: false })
                    toast({ title: 'Discount removed' })
                }
            })
        } else {
            update(tierId, { enabled: true })
        }
    }

    const handleSave = (row: DiscountRow) => {
        const value = parseFloat(row.discountValue)
        if (!row.discountValue || isNaN(value) || value <= 0) {
            toast({ title: 'Invalid discount', description: 'Enter a value greater than 0', variant: 'destructive' })
            return
        }
        if (row.discountType === 'percentage' && value > 100) {
            toast({ title: 'Invalid discount', description: 'Percentage cannot exceed 100%', variant: 'destructive' })
            return
        }
        const maxTickets = parseInt(row.maxTickets) || 1

        update(row.tierId, { saving: true })
        startTransition(async () => {
            const result = await upsertEventDiscount(eventId, row.tierId, row.discountType, value, maxTickets)
            if (result.error) {
                toast({ title: 'Error', description: result.error, variant: 'destructive' })
                update(row.tierId, { saving: false })
            } else {
                update(row.tierId, { saving: false })
                toast({ title: 'Discount saved' })
            }
        })
    }

    const previewPrice = (row: DiscountRow, basePrice: number): string | null => {
        const value = parseFloat(row.discountValue)
        if (!row.enabled || !row.discountValue || isNaN(value) || value <= 0) return null
        if (row.discountType === 'percentage') {
            const discounted = basePrice * (1 - value / 100)
            return discounted > 0 ? `₱${discounted.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : 'Free'
        }
        const discounted = basePrice - value
        return discounted > 0 ? `₱${discounted.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : 'Free'
    }

    return (
        <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Crown className="h-6 w-6 text-primary" />
                    Subscriber Discounts
                </h2>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
                Offer discounted ticket prices to your subscribers. Applies to 1 ticket per subscriber by default.
            </p>

            {activeTiers.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center">
                    <Crown className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p className="font-medium text-sm mb-1">No subscription tiers yet</p>
                    <p className="text-sm text-muted-foreground mb-3">
                        Create a membership tier first, then come back to offer subscriber discounts on this event.
                    </p>
                    <Button variant="outline" size="sm" asChild>
                        <Link href="/organizer/subscriptions">
                            <Plus className="h-4 w-4 mr-1.5" />
                            Create a Tier
                            <ExternalLink className="h-3 w-3 ml-1.5 opacity-50" />
                        </Link>
                    </Button>
                </div>
            ) : (
                <div className="space-y-4">
                    {rows.map(row => (
                        <div
                            key={row.tierId}
                            className={`rounded-lg border p-4 transition-colors ${row.enabled ? 'border-primary/40 bg-primary/5' : 'border-border'}`}
                        >
                            <div className="flex items-center justify-between gap-3 mb-3">
                                <div className="flex items-center gap-2">
                                    <Crown className="h-4 w-4 text-primary shrink-0" />
                                    <span className="font-semibold">{row.tierName}</span>
                                    <Badge variant="outline" className="text-xs">₱{Number(row.tierPrice).toLocaleString()}/mo</Badge>
                                </div>
                                <Button
                                    variant={row.enabled ? 'outline' : 'secondary'}
                                    size="sm"
                                    onClick={() => handleToggle(row.tierId, !row.enabled)}
                                    disabled={row.saving}
                                    className="shrink-0"
                                >
                                    {row.enabled ? (
                                        <><Trash2 className="h-3.5 w-3.5 mr-1.5 text-destructive" /> Remove</>
                                    ) : (
                                        <><Plus className="h-3.5 w-3.5 mr-1.5" /> Add Discount</>
                                    )}
                                </Button>
                            </div>

                            {row.enabled && (
                                <div className="space-y-3">
                                    {/* Type toggle */}
                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={row.discountType === 'percentage' ? 'default' : 'outline'}
                                            onClick={() => update(row.tierId, { discountType: 'percentage' })}
                                            className="flex-1"
                                        >
                                            <Percent className="h-3.5 w-3.5 mr-1.5" />
                                            Percentage
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={row.discountType === 'fixed_price' ? 'default' : 'outline'}
                                            onClick={() => update(row.tierId, { discountType: 'fixed_price' })}
                                            className="flex-1"
                                        >
                                            <DollarSign className="h-3.5 w-3.5 mr-1.5" />
                                            Fixed Price
                                        </Button>
                                    </div>

                                    {/* Value + max tickets */}
                                    <div className="flex gap-3">
                                        <div className="flex-1">
                                            <label className="text-xs text-muted-foreground mb-1 block">
                                                {row.discountType === 'percentage' ? 'Discount (%)' : 'Subscriber Price (₱)'}
                                            </label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                                                    {row.discountType === 'percentage' ? '%' : '₱'}
                                                </span>
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    max={row.discountType === 'percentage' ? 100 : undefined}
                                                    step="0.01"
                                                    value={row.discountValue}
                                                    onChange={e => update(row.tierId, { discountValue: e.target.value })}
                                                    className="pl-8"
                                                    placeholder={row.discountType === 'percentage' ? 'e.g. 10' : 'e.g. 500'}
                                                />
                                            </div>
                                        </div>
                                        <div className="w-32">
                                            <label className="text-xs text-muted-foreground mb-1 block">Max Tickets</label>
                                            <Input
                                                type="number"
                                                min="1"
                                                step="1"
                                                value={row.maxTickets}
                                                onChange={e => update(row.tierId, { maxTickets: e.target.value })}
                                                placeholder="1"
                                            />
                                        </div>
                                    </div>

                                    {/* Preview */}
                                    <div className="flex items-center justify-between">
                                        <div className="text-xs text-muted-foreground">
                                            {(() => {
                                                const preview = previewPrice(row, 0)
                                                return preview ? (
                                                    <span>Subscribers pay <span className="font-semibold text-primary">{preview}</span> per ticket</span>
                                                ) : (
                                                    <span>Enter a value to see the subscriber price</span>
                                                )
                                            })()}
                                        </div>
                                        <Button
                                            size="sm"
                                            onClick={() => handleSave(row)}
                                            disabled={row.saving}
                                        >
                                            {row.saving ? 'Saving…' : 'Save'}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </Card>
    )
}
