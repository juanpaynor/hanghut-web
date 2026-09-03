'use client'

import { useState, useMemo, useEffect } from 'react'
import { format, parseISO, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isToday, isBefore } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
// usePathname rather than window.location: this renders on the server first, so
// reading window would ship one href in the HTML and a different one after
// hydration — a mismatch, and a wrong `next` for anyone who clicks early.
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2, CalendarClock, Users, CheckCircle2, XCircle, ChevronLeft, ChevronRight, LogIn, Tag, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { RegistrationQuestionsForm, QuestionForForm, RegistrationAnswer } from '@/components/events/registration-questions-form'

/** What the SERVER said this code is worth. Never computed on the client. */
interface AppliedPromo {
    code: string
    discount: number
    total: number
}

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
    questions?: QuestionForForm[]
}

export function ExperienceSlotPicker({
    tableId,
    schedules,
    basePricePerPerson,
    currency = 'PHP',
    isLoggedIn = true,
    successUrl,
    failureUrl,
    questions = [],
}: ExperienceSlotPickerProps) {
    const { toast } = useToast()
    const pathname = usePathname()
    const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null)
    const [quantity, setQuantity] = useState(1)
    const [loading, setLoading] = useState(false)
    const [questionsOpen, setQuestionsOpen] = useState(false)
    const [selectedDate, setSelectedDate] = useState<Date | null>(null)
    const [calendarMonth, setCalendarMonth] = useState(() => {
        // Initialize to the month of the first future open slot
        const futureSlots = schedules
            .filter(s => s.status === 'open' && !isBefore(new Date(s.start_time), new Date()))
            .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
        return futureSlots[0] ? new Date(futureSlots[0].start_time) : new Date()
    })

    const symbol = currency === 'PHP' ? '₱' : currency

    const now = new Date()

    const openSlots = useMemo(() =>
        schedules
            .filter((s) => (s.status === 'open' || s.status === 'full') && !isBefore(new Date(s.start_time), now))
            .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    , [schedules])

    // Dates that have available slots
    const slotDates = useMemo(() => {
        const dates = new Set<string>()
        openSlots.forEach(s => {
            dates.add(format(parseISO(s.start_time), 'yyyy-MM-dd'))
        })
        return dates
    }, [openSlots])

    // Filter slots by selected date
    const filteredSlots = useMemo(() => {
        if (!selectedDate) return openSlots
        return openSlots.filter(s => isSameDay(parseISO(s.start_time), selectedDate))
    }, [openSlots, selectedDate])

    const selectedSlot = openSlots.find((s) => s.id === selectedScheduleId)
    const effectivePrice = selectedSlot?.price_per_person ?? basePricePerPerson
    const listPrice = effectivePrice * quantity

    // ── Promo code ────────────────────────────────────────────────────────────
    // The applied discount is only ever what the SERVER returned. Recomputing it
    // here would let the screen and the invoice disagree, and the invoice wins.
    const [promoInput, setPromoInput] = useState('')
    const [promo, setPromo] = useState<AppliedPromo | null>(null)
    const [promoError, setPromoError] = useState<string | null>(null)
    const [checkingPromo, setCheckingPromo] = useState(false)

    // A code priced for 2 guests is wrong the moment they pick 3, and a stale
    // discount on screen is worse than no discount at all.
    useEffect(() => {
        if (promo) { setPromo(null); setPromoError(null) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quantity, selectedScheduleId])

    const applyPromo = async () => {
        const code = promoInput.trim()
        if (!code || checkingPromo) return
        setCheckingPromo(true)
        setPromoError(null)
        try {
            const supabase = createClient()
            const { data, error } = await supabase.rpc('preview_experience_promo', {
                p_table_id: tableId,
                p_code: code,
                p_quantity: quantity,
                p_schedule_id: selectedScheduleId ?? null,
                p_source: 'web',
            })
            if (error) throw error
            if (data?.valid) {
                setPromo({
                    code: data.code,
                    discount: Number(data.discount) || 0,
                    total: Number(data.total) || 0,
                })
            } else {
                setPromo(null)
                setPromoError(data?.message ?? "That code isn't valid for this experience.")
            }
        } catch {
            setPromo(null)
            setPromoError('Could not check that code. Please try again.')
        } finally {
            setCheckingPromo(false)
        }
    }

    const totalPrice = promo ? promo.total : listPrice

    // Calendar grid
    const calendarDays = useMemo(() => {
        const start = startOfMonth(calendarMonth)
        const end = endOfMonth(calendarMonth)
        const days = eachDayOfInterval({ start, end })
        const startDow = getDay(start) // 0 = Sunday
        const padding: null[] = Array(startDow).fill(null)
        return [...padding, ...days]
    }, [calendarMonth])

    // Book click: validate, then gate on the questions form if the host set any.
    // The answers come back through the modal's onComplete → submitBooking.
    const handleBook = async () => {
        if (!selectedScheduleId) {
            toast({ title: 'Select a slot', description: 'Please choose an available time slot.', variant: 'destructive' })
            return
        }

        // Server-side this would fail anyway (user_id NOT NULL), so stop it here with a
        // useful message rather than letting the edge function return an opaque 500.
        if (!isLoggedIn) {
            toast({
                title: 'Sign in to book',
                description: 'Experiences are booked to your account so you can message your host.',
                variant: 'destructive',
            })
            return
        }

        if (questions.length > 0) {
            setQuestionsOpen(true)
            return
        }

        submitBooking([])
    }

    const submitBooking = async (answers: RegistrationAnswer[]) => {
        if (!selectedScheduleId) return

        setLoading(true)
        const supabase = createClient()

        try {
            const body: Record<string, unknown> = {
                table_id: tableId,
                schedule_id: selectedScheduleId,
                quantity,
                success_url: successUrl,
                failure_url: failureUrl,
                source: 'web',
            }
            // Only the code travels — the server re-validates and re-prices it.
            if (promo) body.promo_code = promo.code
            if (answers.length > 0) body.answers = answers

            // No guest_details branch: booking is account-only, so the edge function
            // always receives an authenticated caller.
            const { data, error } = await supabase.functions.invoke('create-experience-intent', { body })

            if (error) throw new Error(error.message)
            // A promo rejected at reserve time (someone claimed the last use while
            // this buyer was deciding) must say so and clear itself, not fail with
            // "Failed to create booking" and leave a dead discount on screen.
            if (data?.code?.startsWith?.('PROMO_')) {
                setPromo(null)
                setPromoError(data.error ?? 'That code is no longer valid.')
                throw new Error(data.error ?? 'Promo code is no longer valid')
            }
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
            {/* Mini Calendar */}
            <div className="rounded-xl border border-border bg-muted/10 p-3">
                {/* Month nav */}
                <div className="flex items-center justify-between mb-3">
                    <button
                        onClick={() => setCalendarMonth(m => subMonths(m, 1))}
                        className="p-1 rounded-md hover:bg-muted transition-colors"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-sm font-semibold">
                        {format(calendarMonth, 'MMMM yyyy')}
                    </span>
                    <button
                        onClick={() => setCalendarMonth(m => addMonths(m, 1))}
                        className="p-1 rounded-md hover:bg-muted transition-colors"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>

                {/* Day headers */}
                <div className="grid grid-cols-7 gap-0.5 mb-1">
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                        <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">
                            {d}
                        </div>
                    ))}
                </div>

                {/* Day cells */}
                <div className="grid grid-cols-7 gap-0.5">
                    {calendarDays.map((day, i) => {
                        if (!day) return <div key={`pad-${i}`} />

                        const dateStr = format(day, 'yyyy-MM-dd')
                        const hasSlot = slotDates.has(dateStr)
                        const isSelected = selectedDate && isSameDay(day, selectedDate)
                        const today = isToday(day)

                        return (
                            <button
                                key={dateStr}
                                onClick={() => {
                                    if (!hasSlot) return
                                    setSelectedDate(isSelected ? null : day)
                                    setSelectedScheduleId(null)
                                    setQuantity(1)
                                }}
                                disabled={!hasSlot}
                                className={cn(
                                    'relative aspect-square flex items-center justify-center rounded-md text-xs transition-all duration-150',
                                    !hasSlot && 'text-muted-foreground/30 cursor-default',
                                    hasSlot && !isSelected && 'font-semibold text-foreground hover:bg-primary/10 cursor-pointer',
                                    isSelected && 'bg-primary text-primary-foreground font-bold shadow-sm',
                                    today && !isSelected && 'ring-1 ring-primary/40'
                                )}
                            >
                                {format(day, 'd')}
                                {hasSlot && !isSelected && (
                                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                                )}
                            </button>
                        )
                    })}
                </div>

                {/* Legend */}
                {selectedDate && (
                    <button
                        onClick={() => { setSelectedDate(null); setSelectedScheduleId(null) }}
                        className="mt-2 text-xs text-primary hover:underline w-full text-center"
                    >
                        Show all dates
                    </button>
                )}
            </div>

            {/* Slot list */}
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {filteredSlots.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No slots on this date</p>
                ) : (
                    filteredSlots.map((slot) => {
                        const start = parseISO(slot.start_time)
                        const end = parseISO(slot.end_time)
                        const spotsLeft = slot.max_guests - slot.current_guests
                        const isFull = spotsLeft <= 0 || slot.status === 'full'
                        const isSelected = selectedScheduleId === slot.id
                        const slotPrice = slot.price_per_person ?? basePricePerPerson

                        return (
                            <button
                                key={slot.id}
                                onClick={() => {
                                    if (!isFull) {
                                        setSelectedScheduleId(slot.id)
                                        setQuantity(1)
                                    }
                                }}
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
                    })
                )}
            </div>

            {/* Guest count selector */}
            {selectedScheduleId && selectedSlot && (
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl border border-border animate-in fade-in slide-in-from-top-2 duration-200">
                    <span className="text-sm font-medium">Guests</span>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                            className="w-8 h-8 rounded-full border-2 border-border flex items-center justify-center text-sm font-bold hover:border-primary hover:text-primary transition-colors"
                        >
                            −
                        </button>
                        <span className="font-bold min-w-[24px] text-center text-lg">{quantity}</span>
                        <button
                            onClick={() =>
                                setQuantity((q) =>
                                    Math.min(selectedSlot.max_guests - selectedSlot.current_guests, q + 1)
                                )
                            }
                            className="w-8 h-8 rounded-full border-2 border-border flex items-center justify-center text-sm font-bold hover:border-primary hover:text-primary transition-colors"
                        >
                            +
                        </button>
                    </div>
                </div>
            )}

            {/* Sign-in gate — replaces the old guest-details form.
                That form could never have worked: experience_purchase_intents.user_id is
                NOT NULL (unlike purchase_intents and merch_orders, which are nullable), so
                reserve_experience raised 23502 on every guest attempt, before Xendit. Guest
                booking was offered in the UI and impossible in the database.

                Requiring an account is the deliberate fix rather than dropping the
                constraint: a paid booking inserts the buyer into table_participants (also
                user_id NOT NULL), which is what puts them in the host's chat. A guest has no
                user_id, so they could never message their host — guest checkout and
                on-platform host communication are mutually exclusive here. */}
            {selectedScheduleId && !isLoggedIn && (
                <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4 text-center animate-in fade-in slide-in-from-top-2 duration-200">
                    <LogIn className="mx-auto h-6 w-6 text-muted-foreground" />
                    <div>
                        <p className="text-sm font-medium">Sign in to book</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Experiences are booked to your account so you can message your host
                            and manage your booking.
                        </p>
                    </div>
                    <Link
                        href={`/experiences/login?next=${encodeURIComponent(pathname)}`}
                        className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                        Sign in or create an account
                    </Link>
                </div>
            )}

            {/* Promo code. Only offered once a slot is chosen — the discount is
                priced against that slot and that party size. */}
            {selectedScheduleId && isLoggedIn && (
                <div className="animate-in fade-in duration-200">
                    {promo ? (
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                            <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-primary">
                                <Tag className="h-4 w-4 shrink-0" />
                                <span className="truncate">{promo.code} applied</span>
                            </span>
                            <button
                                type="button"
                                onClick={() => { setPromo(null); setPromoInput(''); setPromoError(null) }}
                                className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
                                aria-label="Remove promo code"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            <input
                                value={promoInput}
                                onChange={(e) => { setPromoInput(e.target.value.toUpperCase()); setPromoError(null) }}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void applyPromo() } }}
                                placeholder="Promo code"
                                autoCapitalize="characters"
                                autoComplete="off"
                                spellCheck={false}
                                className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm uppercase tracking-wide outline-none focus:border-primary"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                className="h-10 shrink-0"
                                onClick={applyPromo}
                                disabled={!promoInput.trim() || checkingPromo}
                            >
                                {checkingPromo ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                            </Button>
                        </div>
                    )}
                    {promoError && (
                        <p role="alert" className="mt-1.5 text-xs text-destructive">{promoError}</p>
                    )}
                </div>
            )}

            {/* Price summary. Itemised once a discount applies, so the buyer can see
                where the number came from rather than just a smaller total. */}
            {selectedScheduleId && (
                <div className="space-y-1 text-sm text-muted-foreground animate-in fade-in duration-200">
                    <div className="flex items-baseline justify-between">
                        <span>{symbol}{effectivePrice.toLocaleString()} × {quantity} guest{quantity !== 1 ? 's' : ''}</span>
                        <span className={cn(promo && 'line-through opacity-60')}>
                            {symbol}{listPrice.toLocaleString()}
                        </span>
                    </div>
                    {promo && (
                        <div className="flex items-baseline justify-between text-primary">
                            <span>{promo.code}</span>
                            <span>−{symbol}{promo.discount.toLocaleString()}</span>
                        </div>
                    )}
                    <div className="flex items-baseline justify-between pt-1">
                        <span className="font-medium text-foreground">Total</span>
                        <span className="text-lg font-bold text-foreground">
                            {symbol}{totalPrice.toLocaleString()}
                        </span>
                    </div>
                </div>
            )}

            {/* Book button */}
            <Button
                onClick={handleBook}
                disabled={!selectedScheduleId || loading || !isLoggedIn}
                className="w-full h-12 font-semibold text-base"
            >
                {loading ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…
                    </>
                ) : !selectedScheduleId ? (
                    'Select a Slot to Book'
                ) : !isLoggedIn ? (
                    'Sign in to Book'
                ) : (
                    `Book Now · ${symbol}${totalPrice.toLocaleString()}`
                )}
            </Button>

            {questions.length > 0 && (
                <RegistrationQuestionsForm
                    eventId={tableId}
                    questions={questions}
                    isOpen={questionsOpen}
                    onClose={() => setQuestionsOpen(false)}
                    onComplete={(answers) => { setQuestionsOpen(false); submitBooking(answers) }}
                    isLoading={loading}
                />
            )}
        </div>
    )
}
