'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Calendar, MapPin, Ticket, ShieldCheck, Loader2, ArrowRight, Lock, Mail, Phone, User, LogIn } from 'lucide-react'
import { format } from 'date-fns'
import { useToast } from '@/hooks/use-toast'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'

interface CheckoutClientProps {
    event: any
    quantity: number
    user: any
}

export function CheckoutClient({ event, quantity, user }: CheckoutClientProps) {
    const router = useRouter()
    const { toast } = useToast()
    const [isLoading, setIsLoading] = useState(false)

    // Guest State
    const [guestDetails, setGuestDetails] = useState({
        name: '',
        email: '',
        phone: ''
    })

    const subtotal = event.ticket_price * quantity
    const total = subtotal

    const handleGuestChange = (field: string, value: string) => {
        setGuestDetails(prev => ({ ...prev, [field]: value }))
    }

    const handlePayment = async () => {
        // STRICT PROTOCOL: Name, Email, and Phone are REQUIRED
        if (!user && (!guestDetails.name || !guestDetails.email || !guestDetails.phone)) {
            toast({
                title: "All Fields Required",
                description: "Name, Email, and Phone are required for ticket delivery.",
                variant: "destructive"
            })
            return
        }

        setIsLoading(true)
        const supabase = createClient()

        try {
            const requestPayload = {
                event_id: event.id,
                quantity: quantity,
                // channel_code removed for Payment Sessions API
                guest_details: !user ? guestDetails : undefined,
                success_url: `${window.location.origin}/checkout/success`,
                failure_url: `${window.location.origin}/events/${event.id}`
            }

            const headers = !user
                ? { Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` }
                : undefined

            console.log('🔵 [CHECKOUT] Calling create-purchase-intent with payload:', requestPayload)
            if (headers) console.log('🔵 [CHECKOUT] Using explicit headers for Guest:', headers)

            const { data, error } = await supabase.functions.invoke('create-purchase-intent', {
                body: requestPayload,
                headers: headers
            })

            console.log('🔵 [CHECKOUT] Edge Function Response:', { data, error })

            if (error) {
                console.error('🔴 [CHECKOUT] Edge Function Error:', error)
                throw new Error(error.message || 'Payment initiation failed')
            }

            if (!data) {
                console.error('🔴 [CHECKOUT] No data received from Edge Function')
                throw new Error('No response from payment service')
            }

            console.log('🔵 [CHECKOUT] Response data:', data)

            if (!data.success) {
                console.error('🔴 [CHECKOUT] Edge Function returned success=false:', data.error)
                throw new Error(data.error?.message || 'Failed to create order')
            }

            if (data.data?.payment_url) {
                console.log('✅ [CHECKOUT] Payment URL received, redirecting to:', data.data.payment_url)
                window.location.href = data.data.payment_url
            } else {
                console.error('🔴 [CHECKOUT] No payment_url in response:', data)
                throw new Error('No payment URL received')
            }

        } catch (error: any) {
            console.error('🔴 [CHECKOUT] Checkout Error:', error)
            toast({
                title: "Checkout Failed",
                description: error.message || "Please try again later.",
                variant: "destructive"
            })
            setIsLoading(false)
        }
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">

                {/* 1. Account / Guest Info */}
                <Card className="border-border/50 shadow-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-primary">
                            <User className="w-5 h-5" />
                            {user ? 'Your Information' : 'Guest Checkout'}
                        </CardTitle>
                        <CardDescription>
                            {user ? 'Tickets will be sent to your registered email.' : 'Enter your details to receive tickets.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {user ? (
                            <div className="flex items-center p-4 bg-muted/30 rounded-lg border border-border/50">
                                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mr-4">
                                    <span className="font-bold text-primary">{user.email?.charAt(0).toUpperCase()}</span>
                                </div>
                                <div>
                                    <p className="font-medium">{user.email}</p>
                                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                                        <Badge variant="secondary" className="text-xs">Authenticated</Badge>
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                <div className="grid sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="name">Full Name <span className="text-destructive">*</span></Label>
                                        <Input
                                            id="name"
                                            placeholder="Juan Cruz"
                                            value={guestDetails.name}
                                            onChange={(e) => handleGuestChange('name', e.target.value)}
                                            className="bg-muted/30"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="email">Email Address <span className="text-destructive">*</span></Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            placeholder="juan@example.com"
                                            value={guestDetails.email}
                                            onChange={(e) => handleGuestChange('email', e.target.value)}
                                            className="bg-muted/30"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="phone">Phone Number <span className="text-destructive">*</span></Label>
                                    <Input
                                        id="phone"
                                        placeholder="+63 912 345 6789"
                                        value={guestDetails.phone}
                                        onChange={(e) => handleGuestChange('phone', e.target.value)}
                                        className="bg-muted/30"
                                    />
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Sticky Order Summary */}
            <div className="lg:col-span-1">
                <div className="sticky top-24 space-y-6">
                    <Card className="border-border/50 shadow-lg border-t-4 border-t-primary">
                        <CardHeader className="bg-muted/20 pb-4">
                            <CardTitle className="flex items-center gap-2">
                                <Ticket className="w-5 h-5" />
                                Order Summary
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            <div className="space-y-3">
                                <h3 className="font-semibold text-lg leading-tight line-clamp-2">{event.title}</h3>

                                <div className="space-y-1 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-primary" />
                                        <span>
                                            {(() => {
                                                try {
                                                    return event.start_date
                                                        ? format(new Date(event.start_date), 'MMMM d, yyyy • h:mm a')
                                                        : 'Date TBA'
                                                } catch (e) {
                                                    return event.start_date || 'Date TBA'
                                                }
                                            })()}
                                        </span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <MapPin className="w-4 h-4 text-primary mt-0.5" />
                                        <span className="line-clamp-1">{event.venue_name}</span>
                                    </div>
                                </div>
                            </div>

                            <Separator />

                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Ticket type</span>
                                    <span className="font-medium">General Admission</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Quantity</span>
                                    <span className="font-medium">x {quantity}</span>
                                </div>
                            </div>

                            <Separator />

                            <div className="flex justify-between items-center pt-2">
                                <span className="font-semibold text-base">Total</span>
                                <span className="font-bold text-2xl text-primary">₱{total.toLocaleString()}</span>
                            </div>
                        </CardContent>
                        <CardFooter className="flex-col gap-3 bg-muted/20 pt-6">
                            <Button
                                className="w-full h-12 text-lg font-semibold shadow-md hover:shadow-lg transition-all"
                                onClick={handlePayment}
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        Proceed to Payment
                                        <ArrowRight className="ml-2 h-5 w-5" />
                                    </>
                                )}
                            </Button>
                            <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
                                <ShieldCheck className="w-3 h-3" />
                                Secure payment processed by Xendit
                            </p>
                        </CardFooter>
                    </Card>
                </div>
            </div>
        </div>
    )
}
