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
import { Ticket, Minus, Plus, Loader2 } from 'lucide-react'
import { Label } from '@/components/ui/label'

interface TicketSelectorProps {
    eventId: string
    ticketPrice: number
    commissionRate?: number // Optional for display if needed
    minTickets?: number
    maxTickets?: number
    isSoldOut: boolean
    fullWidth?: boolean
    trigger?: React.ReactNode
}

export function TicketSelector({
    eventId,
    ticketPrice,
    minTickets = 1,
    maxTickets = 10,
    isSoldOut,
    fullWidth = false,
    trigger
}: TicketSelectorProps) {
    const router = useRouter()
    const [isOpen, setIsOpen] = useState(false)
    const [quantity, setQuantity] = useState(minTickets)
    const [isLoading, setIsLoading] = useState(false)

    const handleIncrement = () => {
        if (quantity < maxTickets) setQuantity(q => q + 1)
    }

    const handleDecrement = () => {
        if (quantity > minTickets) setQuantity(q => q - 1)
    }

    const handleCheckout = () => {
        setIsLoading(true)
        // Redirect to checkout page with params
        router.push(`/checkout?eventId=${eventId}&quantity=${quantity}`)
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
                        disabled={isSoldOut}
                    >
                        <Ticket className="h-5 w-5 mr-2" />
                        {isSoldOut ? 'Sold Out' : 'Get Tickets'}
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Select Tickets</DialogTitle>
                    <DialogDescription>
                        Choose how many tickets you would like to purchase.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-6">
                    <div className="flex items-center justify-between mb-6">
                        <Label className="text-base font-semibold">General Admission</Label>
                        <div className="text-right">
                            <div className="font-bold text-lg">
                                {ticketPrice === 0 ? 'Free' : `₱${ticketPrice.toLocaleString()}`}
                            </div>
                            <div className="text-xs text-muted-foreground">per ticket</div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between bg-muted/50 p-4 rounded-lg">
                        <span className="text-sm font-medium">Quantity</span>
                        <div className="flex items-center gap-4">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-full"
                                onClick={handleDecrement}
                                disabled={quantity <= minTickets}
                            >
                                <Minus className="h-3 w-3" />
                            </Button>
                            <span className="font-bold w-4 text-center">{quantity}</span>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-full"
                                onClick={handleIncrement}
                                disabled={quantity >= maxTickets}
                            >
                                <Plus className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>

                    <div className="flex justify-between mt-6 pt-6 border-t font-bold text-lg">
                        <span>Total</span>
                        <span>
                            {ticketPrice === 0 ? 'Free' : `₱${(ticketPrice * quantity).toLocaleString()}`}
                        </span>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        className="w-full bg-primary"
                        size="lg"
                        onClick={handleCheckout}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            'Proceed to Checkout'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
