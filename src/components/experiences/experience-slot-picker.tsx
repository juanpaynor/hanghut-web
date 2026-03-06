'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Loader2, CalendarClock, Users, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

import { useRouter, usePathname } from 'next/navigation'

interface Schedule {
    id: string
    table_id: string
    start_time: string
    end_time: string
    max_guests: number
    current_guests: number
    price_per_person?: number | null
    status: 'open' | 'full' | 'cancelled' | 'completed'
}

interface ExperienceSlotPickerProps {
    tableId: string
    schedules: Schedule[]
    basePricePerPerson: number
    currency?: string
    isLoggedIn?: boolean
    successUrl: string
    failureUrl: string
}

export function ExperienceSlotPicker({
    tableId,
    schedules,
    basePricePerPerson,
    currency = 'PHP',
    isLoggedIn = true,
    successUrl,
    failureUrl,
}: ExperienceSlotPickerProps) {
    const { toast } = useToast()
    const router = useRouter()
    const pathname = usePathname()
    const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null)
    const [quantity, setQuantity] = useState(1)
    const [loading, setLoading] = useState(false)

    const symbol = currency === 'PHP' ? '₱' : currency

    const openSlots = schedules.filter(
        (s) => s.status === 'open' || s.status === 'full'
    ).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

    const selectedSlot = openSlots.find((s) => s.id === selectedScheduleId)
    const effectivePrice = selectedSlot?.price_per_person ?? basePricePerPerson
    const totalPrice = effectivePrice * quantity

    const handleBook = async () => {
        if (!isLoggedIn) {
            router.push(`/login?next=${encodeURIComponent(pathname)}`)
            return
        }

        if (!selectedScheduleId) {
            toast({ title: 'Select a slot', description: 'Please choose an available time slot.', variant: 'destructive' })
            return
        }

        setLoading(true)
        const supabase = createClient()

        try {
            const { data, error } = await supabase.functions.invoke('create-experience-intent', {
                body: {
                    table_id: tableId,
                    schedule_id: selectedScheduleId,
                    quantity,
                    success_url: successUrl,
                    failure_url: failureUrl,
                },
            })

            if (error) throw new Error(error.message)
            if (!data?.success) throw new Error(data?.error?.message ?? 'Failed to create booking')

            if (data.data?.payment_url) {
                window.location.href = data.data.payment_url
            } else {
                throw new Error('No payment URL received')
            }
        } catch (err: any) {
            toast({
                title: 'Booking failed',
                description: err.message || 'Please try again.',
                variant: 'destructive',
            })
            setLoading(false)
        }
    }

    if (openSlots.length === 0) {
        return (
            <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
                <CalendarClock className="h-10 w-10 opacity-40" />
                <p className="font-medium">No available slots</p>
                <p className="text-sm">Check back soon for new schedules.</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Slot list */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {openSlots.map((slot) => {
                    const start = parseISO(slot.start_time)
                    const end = parseISO(slot.end_time)
                    const spotsLeft = slot.max_guests - slot.current_guests
                    const isFull = spotsLeft <= 0 || slot.status === 'full'
                    const isSelected = selectedScheduleId === slot.id
                    const slotPrice = slot.price_per_person ?? basePricePerPerson

                    return (
                        <button
                            key={slot.id}
                            onClick={() => !isFull && setSelectedScheduleId(slot.id)}
                            disabled={isFull}
                            className={cn(
                                'w-full text-left rounded-xl border-2 p-3 transition-all duration-200',
                                isFull
                                    ? 'border-border/30 bg-muted/30 opacity-50 cursor-not-allowed'
                                    : isSelected
                                        ? 'border-primary bg-primary/5 shadow-md'
                                        : 'border-border hover:border-primary/50 hover:bg-muted/30 cursor-pointer'
                            )}
                        >
                            <div className="flex items-stretch gap-3">
                                {/* Month/Day pill */}
                                <div className="flex flex-col items-center justify-center bg-primary/10 text-primary rounded-lg px-2.5 py-1.5 min-w-[44px]">
                                    <span className="text-[10px] font-bold uppercase leading-none">
                                        {format(start, 'MMM')}
                                    </span>
                                    <span className="text-xl font-extrabold leading-tight">
                                        {format(start, 'd')}
                                    </span>
                                </div>

                                {/* Time + info */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-foreground">
                                        {format(start, 'EEEE')} • {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
                                    </p>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className={cn(
                                            'text-xs font-medium flex items-center gap-1',
                                            isFull ? 'text-destructive' : spotsLeft <= 3 ? 'text-orange-500' : 'text-muted-foreground'
                                        )}>
                                            <Users className="h-3 w-3" />
                                            {isFull ? 'Sold Out' : `${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left`}
                                        </span>
                                        {slot.price_per_person && (
                                            <span className="text-xs text-muted-foreground">
                                                {symbol}{slotPrice.toLocaleString()}/person
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Status icon */}
                                <div className="flex items-center shrink-0">
                                    {isFull ? (
                                        <XCircle className="h-4 w-4 text-muted-foreground/40" />
                                    ) : isSelected ? (
                                        <CheckCircle2 className="h-4 w-4 text-primary" />
                                    ) : (
                                        <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                                    )}
                                </div>
                            </div>
                        </button>
                    )
                })}
            </div>

            {/* Guest count selector */}
            {selectedScheduleId && selectedSlot && (
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl border border-border">
                    <span className="text-sm font-medium">Guests</span>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                            className="w-7 h-7 rounded-full border-2 border-border flex items-center justify-center text-sm font-bold hover:border-primary hover:text-primary transition-colors"
                        >
                            −
                        </button>
                        <span className="font-bold min-w-[20px] text-center">{quantity}</span>
                        <button
                            onClick={() =>
                                setQuantity((q) =>
                                    Math.min(selectedSlot.max_guests - selectedSlot.current_guests, q + 1)
                                )
                            }
                            className="w-7 h-7 rounded-full border-2 border-border flex items-center justify-center text-sm font-bold hover:border-primary hover:text-primary transition-colors"
                        >
                            +
                        </button>
                    </div>
                </div>
            )}

            {/* Price summary */}
            {selectedScheduleId && (
                <div className="flex justify-between items-baseline text-sm text-muted-foreground">
                    <span>{symbol}{effectivePrice.toLocaleString()} × {quantity} guest{quantity !== 1 ? 's' : ''}</span>
                    <span className="text-lg font-bold text-foreground">{symbol}{totalPrice.toLocaleString()}</span>
                </div>
            )}

            {/* Book button */}
            <Button
                onClick={handleBook}
                disabled={!selectedScheduleId || loading}
                className="w-full h-11 font-semibold text-base"
            >
                {loading ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…
                    </>
                ) : selectedScheduleId ? (
                    `Book Now · ${symbol}${totalPrice.toLocaleString()}`
                ) : (
                    'Select a Slot to Book'
                )}
            </Button>
        </div>
    )
}
