'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from '@/components/ui/dialog'
import { Ticket, Minus, Plus, Loader2, Check } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface TicketSelectorProps {
    eventId: string
    ticketPrice: number
    minTickets?: number
    maxTickets?: number
    isSoldOut: boolean
    fullWidth?: boolean
    trigger?: React.ReactNode
    tiers?: any[]
}

export function TicketSelector({
    eventId,
    ticketPrice,
    minTickets = 1,
    maxTickets = 10,
    isSoldOut,
    fullWidth = false,
    trigger,
    tiers = []
}: TicketSelectorProps) {
    const router = useRouter()
    const [isOpen, setIsOpen] = useState(false)
    const [quantity, setQuantity] = useState(minTickets)
    const [isLoading, setIsLoading] = useState(false)

    // Sort active tiers by price
    const activeTiers = tiers?.filter((t: any) => t.is_active !== false)
        .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0) || a.price - b.price) || []

    // Default to first tier if exists
    const [selectedTierId, setSelectedTierId] = useState<string | null>(
        activeTiers.length > 0 ? activeTiers[0].id : null
    )

    const selectedTier = activeTiers.find((t: any) => t.id === selectedTierId)

    // Determine effective price and limits based on selection or fallback
    const effectivePrice = selectedTier ? Number(selectedTier.price) : ticketPrice
    const effectiveMin = selectedTier?.min_per_order || minTickets
    const effectiveMax = selectedTier?.max_per_order || maxTickets

    // Determine sold out state for specific tier
    const isTierSoldOut = selectedTier
        ? (selectedTier.quantity_sold >= selectedTier.quantity_total)
        : isSoldOut

    const handleIncrement = () => {
        if (quantity < effectiveMax) setQuantity(q => q + 1)
    }

    const handleDecrement = () => {
        if (quantity > effectiveMin) setQuantity(q => q - 1)
    }

    const handleCheckout = () => {
        setIsLoading(true)
        const params = new URLSearchParams()
        params.set('eventId', eventId)
        params.set('quantity', quantity.toString())
        if (selectedTierId) {
            params.set('tierId', selectedTierId)
        }

        router.push(`/checkout?${params.toString()}`)
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                {trigger ? (
                    trigger
                ) : (
                    <Button
                        size="lg"
                        className={fullWidth ? "w-full bg-primary" : "bg-primary w-full md:w-auto"}
                        disabled={isSoldOut && activeTiers.length === 0} // Allow opening if tiers exist even if main is "sold out" (logic depends on aggregator)
                    >
                        <Ticket className="h-5 w-5 mr-2" />
                        {isSoldOut && activeTiers.length === 0 ? 'Sold Out' : 'Get Tickets'}
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Select Tickets</DialogTitle>
                    <DialogDescription>
                        Choose your ticket type and quantity.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-6 space-y-6">
                    {/* Tier Selection */}
                    {activeTiers.length > 0 ? (
                        <RadioGroup
                            value={selectedTierId || ''}
                            onValueChange={setSelectedTierId}
                            className="space-y-3"
                        >
                            {activeTiers.map((tier: any) => {
                                const isSoldOut = tier.quantity_sold >= tier.quantity_total
                                return (
                                    <Label
                                        key={tier.id}
                                        htmlFor={tier.id}
                                        className={cn(
                                            "flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all hover:bg-muted/50",
                                            selectedTierId === tier.id ? "border-primary bg-primary/5" : "border-border",
                                            isSoldOut ? "opacity-50 cursor-not-allowed" : ""
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <RadioGroupItem value={tier.id} id={tier.id} disabled={isSoldOut} />
                                            <div>
                                                <div className="font-bold flex items-center gap-2">
                                                    {tier.name}
                                                    {isSoldOut && <Badge variant="destructive" className="text-[10px] h-5">Sold Out</Badge>}
                                                </div>
                                                {tier.description && (
                                                    <div className="text-xs text-muted-foreground">{tier.description}</div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="font-bold">
                                            {Number(tier.price) === 0 ? 'Free' : `₱${Number(tier.price).toLocaleString()}`}
                                        </div>
                                    </Label>
                                )
                            })}
                        </RadioGroup>
                    ) : (
                        <div className="flex items-center justify-between mb-6">
                            <Label className="text-base font-semibold">General Admission</Label>
                            <div className="text-right">
                                <div className="font-bold text-lg">
                                    {ticketPrice === 0 ? 'Free' : `₱${ticketPrice.toLocaleString()}`}
                                </div>
                                <div className="text-xs text-muted-foreground">per ticket</div>
                            </div>
                        </div>
                    )}

                    {/* Quantity Selector */}
                    <div className="flex items-center justify-between bg-muted/50 p-4 rounded-lg">
                        <span className="text-sm font-medium">Quantity</span>
                        <div className="flex items-center gap-4">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-full"
                                onClick={handleDecrement}
                                disabled={quantity <= effectiveMin || isTierSoldOut}
                            >
                                <Minus className="h-3 w-3" />
                            </Button>
                            <span className="font-bold w-4 text-center">{quantity}</span>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-full"
                                onClick={handleIncrement}
                                disabled={quantity >= effectiveMax || isTierSoldOut}
                            >
                                <Plus className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>

                    <div className="flex justify-between mt-6 pt-6 border-t font-bold text-lg">
                        <span>Total</span>
                        <span>
                            {effectivePrice === 0 ? 'Free' : `₱${(effectivePrice * quantity).toLocaleString()}`}
                        </span>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        className="w-full bg-primary"
                        size="lg"
                        onClick={handleCheckout}
                        disabled={isLoading || isTierSoldOut}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            isTierSoldOut ? 'Sold Out' : 'Proceed to Checkout'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
