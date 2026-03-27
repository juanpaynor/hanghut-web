import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import Image from 'next/image'
import { CheckCircle2, CalendarClock, Mail, ArrowRight, MapPin, Users, Ticket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Booking Confirmed — HangHut Experiences',
    description: 'Your experience has been booked successfully.',
}

interface Props {
    searchParams: Promise<{ intent_id?: string }>
}

export default async function ExperienceSuccessPage({ searchParams }: Props) {
    const { intent_id } = await searchParams
    let booking: any = null

    if (intent_id) {
        const supabase = await createClient()
        const { data } = await supabase
            .from('experience_purchase_intents')
            .select(`
                *,
                schedule:experience_schedules(
                    start_time,
                    end_time,
                    table:tables(id, title, images, location_name)
                )
            `)
            .eq('id', intent_id)
            .single()

        booking = data
    }

    const experienceName = booking?.schedule?.table?.title
    const experienceId = booking?.schedule?.table?.id
    const heroImage = booking?.schedule?.table?.images?.[0]
    const locationName = booking?.schedule?.table?.location_name
    const startTime = booking?.schedule?.start_time
    const endTime = booking?.schedule?.end_time
    const email = booking?.guest_email
    const guestName = booking?.guest_name
    const quantity = booking?.quantity ?? 1

    return (
        <div className="min-h-screen bg-background flex flex-col">
            {/* Navbar */}
            <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
                <div className="container mx-auto px-4 flex h-14 items-center">
                    <Link href="/" className="flex items-center gap-2 font-bold text-xl hover:opacity-80 transition-opacity">
                        <div className="bg-primary px-3 py-1 rounded-md text-primary-foreground transform -rotate-2 text-base">
                            HANGHUT
                        </div>
                    </Link>
                </div>
            </header>

            <main className="flex-1 flex items-center justify-center p-4">
                <div className="w-full max-w-lg space-y-6">

                    {/* Success header */}
                    <div className="text-center space-y-3">
                        <div className="w-20 h-20 mx-auto rounded-full bg-green-500/10 flex items-center justify-center ring-4 ring-green-500/20">
                            <CheckCircle2 className="h-10 w-10 text-green-500" />
                        </div>
                        <h1 className="text-2xl font-extrabold tracking-tight">You're all set! 🎉</h1>
                        <p className="text-muted-foreground text-sm leading-relaxed">
                            {experienceName
                                ? `Your spot in "${experienceName}" has been confirmed.`
                                : 'Your experience has been booked successfully.'}
                        </p>
                    </div>

                    {/* Experience Card */}
                    {booking && (
                        <Card className="overflow-hidden border-2 border-border/50 shadow-xl">
                            {/* Hero image */}
                            {heroImage && (
                                <div className="relative h-48 w-full overflow-hidden">
                                    <Image
                                        src={heroImage}
                                        alt={experienceName ?? 'Experience'}
                                        fill
                                        className="object-cover"
                                        sizes="(max-width: 640px) 100vw, 512px"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                                    <div className="absolute bottom-4 left-4">
                                        <h2 className="text-white font-bold text-lg leading-snug drop-shadow-md">
                                            {experienceName}
                                        </h2>
                                        {locationName && (
                                            <p className="text-white/80 text-xs flex items-center gap-1 mt-1">
                                                <MapPin className="h-3 w-3" />
                                                {locationName}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            <CardContent className="p-5 space-y-3">
                                {/* Date & Time */}
                                {startTime && (
                                    <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                                        <CalendarClock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                                        <div>
                                            <p className="text-xs text-muted-foreground">Date & Time</p>
                                            <p className="text-sm font-semibold">
                                                {new Date(startTime).toLocaleString('en-PH', {
                                                    weekday: 'long',
                                                    month: 'long',
                                                    day: 'numeric',
                                                    hour: 'numeric',
                                                    minute: '2-digit',
                                                })}
                                                {endTime && (
                                                    <> – {new Date(endTime).toLocaleString('en-PH', {
                                                        hour: 'numeric',
                                                        minute: '2-digit',
                                                    })}</>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Guest info row */}
                                <div className="grid grid-cols-2 gap-3">
                                    {quantity > 0 && (
                                        <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                                            <Users className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                                            <div>
                                                <p className="text-xs text-muted-foreground">Guests</p>
                                                <p className="text-sm font-semibold">{quantity} guest{quantity !== 1 ? 's' : ''}</p>
                                            </div>
                                        </div>
                                    )}
                                    <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                                        <Ticket className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                                        <div>
                                            <p className="text-xs text-muted-foreground">Status</p>
                                            <p className="text-sm font-semibold text-green-600">Confirmed</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Confirmation email */}
                                {email && (
                                    <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                                        <Mail className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                                        <div>
                                            <p className="text-xs text-muted-foreground">Confirmation sent to</p>
                                            <p className="text-sm font-semibold">{email}</p>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Actions */}
                    <div className="flex flex-col gap-2">
                        <Button asChild className="w-full h-11 font-semibold">
                            <Link href="/experiences">
                                Explore More Experiences
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                        {experienceId && (
                            <Button variant="outline" asChild className="w-full">
                                <Link href={`/experiences/${experienceId}`}>Back to Experience</Link>
                            </Button>
                        )}
                        <Button variant="ghost" asChild className="w-full text-muted-foreground">
                            <Link href="/">Back to Home</Link>
                        </Button>
                    </div>
                </div>
            </main>
        </div>
    )
}
