import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CheckCircle2, Home, Mail, Armchair, CalendarClock, MapPin } from 'lucide-react'
import type { Metadata } from 'next'
import { formatEventDateTime } from '@/lib/datetime'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Payment Successful — HangHut',
    description: 'Your booking is confirmed.',
}

interface Props {
    searchParams: Promise<{ intent_id?: string }>
}

interface SeatInfo {
    section: string
    row: string
    seat: number
    label: string
}

export default async function PurchaseSuccessPage({ searchParams }: Props) {
    const { intent_id } = await searchParams

    let eventTitle: string | null = null
    let venueName: string | null = null
    let startTime: string | null = null
    let quantity = 0
    let seats: SeatInfo[] = []

    if (intent_id) {
        // Admin client: guests have no session, and the intent UUID itself is
        // the access token here. Read-only, display-safe fields only.
        const supabase = createAdminClient()
        const { data: intent } = await supabase
            .from('purchase_intents')
            .select('quantity, status, event:events(title, venue_name, start_datetime)')
            .eq('id', intent_id)
            .maybeSingle()

        if (intent) {
            const event = intent.event as any
            eventTitle = event?.title ?? null
            venueName = event?.venue_name ?? null
            startTime = event?.start_datetime ?? null
            quantity = intent.quantity ?? 0

            const { data: ticketRows } = await supabase
                .from('tickets')
                .select('seat_info')
                .eq('purchase_intent_id', intent_id)
                .not('seat_info', 'is', null)
            seats = (ticketRows ?? [])
                .map(t => t.seat_info as SeatInfo)
                .filter(Boolean)
                .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
        }
    }

    return (
        <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
            <Card className="max-w-md w-full p-8 text-center space-y-6">
                <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto animate-in zoom-in duration-500">
                    <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
                </div>

                <div className="space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight">Payment Successful!</h1>
                    <p className="text-muted-foreground">
                        {eventTitle
                            ? <>Your booking for <span className="font-semibold text-foreground">{eventTitle}</span> is confirmed.</>
                            : 'Your booking is confirmed.'}
                    </p>
                </div>

                {/* Booking summary */}
                {(startTime || venueName) && (
                    <div className="bg-muted/50 p-4 rounded-lg text-left border border-border/50 space-y-2">
                        {startTime && (
                            <p className="text-sm flex items-center gap-2">
                                <CalendarClock className="h-4 w-4 text-primary shrink-0" />
                                {formatEventDateTime(startTime)}
                            </p>
                        )}
                        {venueName && (
                            <p className="text-sm flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-primary shrink-0" />
                                {venueName}
                            </p>
                        )}
                    </div>
                )}

                {/* Assigned seats */}
                {seats.length > 0 && (
                    <div className="bg-primary/5 border border-primary/20 p-4 rounded-lg text-left">
                        <p className="text-sm font-semibold flex items-center gap-2 mb-3">
                            <Armchair className="h-4 w-4 text-primary" />
                            Your Seat{seats.length !== 1 ? 's' : ''} — {seats[0].section}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {seats.map(seat => (
                                <span
                                    key={seat.label}
                                    className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold tracking-wide"
                                >
                                    Row {seat.row} · Seat {seat.seat}
                                </span>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            Seat assignments are printed on your tickets.
                        </p>
                    </div>
                )}

                <div className="bg-muted/50 p-6 rounded-lg text-left border border-border/50">
                    <div className="flex items-start gap-4 mb-4">
                        <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                            <Mail className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h3 className="font-semibold mb-1">Check your Email</h3>
                            <p className="text-sm text-muted-foreground">
                                We&apos;ve sent your {quantity > 1 ? `${quantity} tickets` : 'ticket'} and receipt to the email address you provided.
                            </p>
                        </div>
                    </div>

                    <h4 className="text-sm font-semibold mt-4 mb-2">What happens next?</h4>
                    <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
                        <li>Open the email from HangHut.</li>
                        <li>Download your ticket QR code.</li>
                        <li>Show the QR code at the venue entrance.</li>
                    </ul>
                </div>

                <div className="space-y-3 pt-2">
                    <Button className="w-full h-11 text-base shadow-sm" asChild>
                        <Link href="/" className="flex items-center gap-2">
                            <Home className="h-4 w-4" />
                            Return to Home
                        </Link>
                    </Button>
                    <Button variant="outline" className="w-full text-muted-foreground" asChild>
                        <Link href="/contact">
                            Need Help? Contact Support
                        </Link>
                    </Button>
                </div>
            </Card>
        </div>
    )
}
