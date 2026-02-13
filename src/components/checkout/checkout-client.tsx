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

import { validatePromoCode } from '@/lib/organizer/promo-actions'
import { subscribeGuestToNewsletter } from '@/lib/marketing/actions'
import { hexToHsl } from '@/lib/utils'

interface CheckoutClientProps {
    event: any
    quantity: number
    user: any
    tier: {
        id: string | null
        name: string
        price: number
        quantity_total: number
        quantity_sold: number
    }
}

export function CheckoutClient({ event, quantity, user, tier }: CheckoutClientProps) {
    const router = useRouter()
    const { toast } = useToast()
    const [isLoading, setIsLoading] = useState(false)

    // Promo Code State
    const [promoCodeInput, setPromoCodeInput] = useState('')
    const [appliedPromo, setAppliedPromo] = useState<{ code: string, discountAmount: number } | null>(null)
    const [promoError, setPromoError] = useState('')

    const [guestDetails, setGuestDetails] = useState({
        name: '',
        email: '',
        phone: ''
    })

    // [NEW] Terms & Newsletter State
    const [termsAccepted, setTermsAccepted] = useState(false)
    const [newsletterSubscribed, setNewsletterSubscribed] = useState(false)

    // Fee Logic
    const organizer = event.organizer || {}
    const passFees = organizer.pass_fees_to_customer || false
    const commissionRate = organizer.pricing_model === 'custom' && organizer.custom_percentage !== null
        ? organizer.custom_percentage / 100
        : 0.15
    const fixedFeePerTicket = parseFloat(organizer.fixed_fee_per_ticket || '15')

    const subtotal = tier.price * quantity
    const discount = appliedPromo ? appliedPromo.discountAmount : 0

    // Calculate Fees (if passed)
    let platformFee = 0
    let fixedFeeTotal = 0
    let processingFee = 0

    // Calculate Fees (if passed)
    if (passFees) {
        // User Request: "15 pesos (Fixed Fee) should be paid by the customer, but the 3% processing fee is still paid by the organizer"
        // We only add the Fixed Fee to the customer's total.
        fixedFeeTotal = fixedFeePerTicket * quantity

        // Platform Fee and Processing % are NOT added to the customer total in this model.
        // They will be deducted from the organizer's payout on the backend.
        platformFee = 0
        processingFee = 0
    }

    const totalFees = fixedFeeTotal // Only the fixed fee is added
    const total = subtotal + totalFees

    const handleGuestChange = (field: string, value: string) => {
        setGuestDetails(prev => ({ ...prev, [field]: value }))
    }

    const applyPromo = async () => {
        setPromoError('')
        setIsLoading(true)
        const result = await validatePromoCode(event.id, promoCodeInput, subtotal)
        setIsLoading(false)

        if (result.error) {
            setPromoError(result.error)
            setAppliedPromo(null)
        } else if (result.success) {
            setAppliedPromo({
                code: result.code!,
                discountAmount: result.discountAmount!
            })
            toast({ title: "Promo Code Applied", description: `You saved ₱${result.discountAmount}` })
        }
    }

    const removePromo = () => {
        setAppliedPromo(null)
        setPromoCodeInput('')
        setPromoError('')
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

        // [NEW] Validate Terms Validation
        if (!termsAccepted) {
            toast({
                title: "Terms Required",
                description: "You must accept the Terms of Service to proceed.",
                variant: "destructive"
            })
            return
        }

        // [Workaround] Subscribe directly via server action since Edge Function might miss it
        if (newsletterSubscribed && event.organizer_id) {
            const email = user?.email || guestDetails.email
            const name = user ? (user.user_metadata?.full_name || user.email) : guestDetails.name

            // Execute in background
            subscribeGuestToNewsletter(event.organizer_id, email, name).catch(err =>
                console.error("Subscription background task failed:", err)
            )
        }

        setIsLoading(true)
        const supabase = createClient()

        try {
            const requestPayload = {
                event_id: event.id,
                quantity: quantity,
                tier_id: tier.id || undefined,
                guest_details: !user ? guestDetails : undefined,
                promo_code: appliedPromo ? appliedPromo.code : undefined,
                subscribed_to_newsletter: newsletterSubscribed,
                // [NEW] Fee Metadata for Edge Function
                metadata: {
                    pass_fees: passFees,
                    commission_rate: commissionRate,
                    fixed_fee_per_ticket: fixedFeePerTicket,
                    calculated_fees: {
                        platform_fee: platformFee,
                        fixed_fee: fixedFeeTotal,
                        processing_fee: processingFee,
                        total_fees: totalFees
                    }
                },
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

    // Theme Logic
    const themeStyle = event.theme_color ? {
        '--primary': hexToHsl(event.theme_color),
        '--ring': hexToHsl(event.theme_color),
    } as React.CSSProperties : undefined;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8" style={themeStyle}>
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
                                                    return event.start_datetime
                                                        ? format(new Date(event.start_datetime), 'MMMM d, yyyy • h:mm a')
                                                        : 'Date TBA'
                                                } catch (e) {
                                                    return event.start_datetime || 'Date TBA'
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
                                    <span className="text-muted-foreground">Tickets ({quantity}x)</span>
                                    <span className="font-medium">₱{subtotal.toLocaleString()}</span>
                                </div>
                                {passFees && (
                                    <div className="flex justify-between text-sm text-muted-foreground">
                                        <div className="flex flex-col">
                                            <span>Booking Fee</span>
                                        </div>
                                        <span>+₱{totalFees.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                )}
                            </div>

                            <Separator />

                            <div className="flex justify-between items-center pt-2">
                                <span className="font-semibold text-base">Total</span>
                                <span className="font-bold text-2xl text-primary">₱{(total - discount).toLocaleString()}</span>
                            </div>
                        </CardContent>
                        <CardFooter className="flex-col gap-3 bg-muted/20 pt-6">
                            {/* Promo Code Input */}
                            <div className="w-full flex gap-2 mb-2">
                                <Input
                                    placeholder="Promo Code"
                                    value={promoCodeInput}
                                    onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                                    disabled={!!appliedPromo || isLoading}
                                />
                                {appliedPromo ? (
                                    <Button variant="outline" onClick={removePromo} disabled={isLoading}>
                                        Remove
                                    </Button>
                                ) : (
                                    <Button variant="secondary" onClick={applyPromo} disabled={!promoCodeInput || isLoading}>
                                        Apply
                                    </Button>
                                )}
                            </div>
                            {promoError && <p className="text-xs text-destructive w-full">{promoError}</p>}
                            {appliedPromo && (
                                <div className="w-full flex justify-between text-sm text-green-600 bg-green-50 p-2 rounded border border-green-200">
                                    <span>Discount applied ({appliedPromo.code})</span>
                                    <span>-₱{discount.toLocaleString()}</span>
                                </div>
                            )}

                            <Separator className="my-2" />

                            {/* [NEW] Terms & Newsletter Checkboxes */}
                            <div className="space-y-3 mb-4">
                                <Label className="flex items-start gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={termsAccepted}
                                        onChange={(e) => setTermsAccepted(e.target.checked)}
                                        className="mt-1 h-4 w-4 rounded border-primary text-primary focus:ring-primary"
                                    />
                                    <span className="text-sm">
                                        I accept the <a href="/terms" target="_blank" className="underline text-primary hover:text-primary/80">Terms of Service</a>
                                        <span className="text-destructive">*</span>
                                    </span>
                                </Label>

                                <Label className="flex items-start gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={newsletterSubscribed}
                                        onChange={(e) => setNewsletterSubscribed(e.target.checked)}
                                        className="mt-1 h-4 w-4 rounded border-primary text-primary focus:ring-primary"
                                    />
                                    <span className="text-sm text-muted-foreground">
                                        Subscribe to news & event updates from the organizer
                                    </span>
                                </Label>
                            </div>

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
                                        Pay ₱{(total - discount).toLocaleString()}
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
