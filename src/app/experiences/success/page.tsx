import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { CheckCircle2, CalendarClock, Mail, ArrowRight } from 'lucide-react'
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
                    table:tables(title, images)
                )
            `)
            .eq('id', intent_id)
            .single()

        booking = data
    }

    const experienceName = booking?.schedule?.table?.title
    const startTime = booking?.schedule?.start_time
    // experience_purchase_intents has: guest_email, guest_name, guest_phone
    const email = booking?.guest_email

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
            {/* Navbar */}
            <header className="fixed top-0 left-0 right-0 z-50 border-b bg-background/80 backdrop-blur">
                <div className="container mx-auto px-4 flex h-14 items-center">
                    <Link href="/" className="flex items-center gap-2 font-bold text-xl hover:opacity-80 transition-opacity">
                        <div className="bg-primary px-3 py-1 rounded-md text-primary-foreground transform -rotate-2 text-base">
                            HANGHUT
                        </div>
                    </Link>
                </div>
            </header>

            <Card className="w-full max-w-md shadow-2xl border-2 border-border/50 mt-14">
                <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-5">
                    {/* Success icon */}
                    <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center ring-4 ring-green-500/20">
                        <CheckCircle2 className="h-10 w-10 text-green-500" />
                    </div>

                    <div>
                        <h1 className="text-2xl font-extrabold tracking-tight">You're all set! 🎉</h1>
                        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                            {experienceName
                                ? `Your spot in "${experienceName}" has been confirmed.`
                                : 'Your experience has been booked successfully.'}
                        </p>
                    </div>

                    {/* Booking details */}
                    {booking && (
                        <div className="w-full space-y-3 text-left">
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
                                        </p>
                                    </div>
                                </div>
                            )}
                            {email && (
                                <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                                    <Mail className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Confirmation sent to</p>
                                        <p className="text-sm font-semibold">{email}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex flex-col gap-2 w-full">
                        <Button asChild className="w-full">
                            <Link href="/">
                                Explore More Experiences
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                        <Button variant="ghost" asChild className="w-full text-muted-foreground">
                            <Link href="/">Back to Home</Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
