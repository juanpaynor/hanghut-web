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
import { useRouter, useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'

import { validatePromoCode } from '@/lib/organizer/promo-actions'
import { subscribeGuestToNewsletter } from '@/lib/marketing/actions'
import { hexToHsl } from '@/lib/utils'
import { CheckCircle2, ClipboardList } from 'lucide-react'

interface RegistrationQuestion {
    id: string
    label: string
    question_type: 'short_text' | 'long_text' | 'single_choice' | 'multi_choice' | 'checkbox' | 'social_profile' | 'url' | 'company'
    options: string[] | null
    is_required: boolean
    display_order: number
}

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
    customTos?: string | null
    organizerName?: string
    registrationQuestions?: RegistrationQuestion[]
}

export function CheckoutClient({ event, quantity, user, tier, customTos, organizerName, registrationQuestions = [] }: CheckoutClientProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { toast } = useToast()
    const [isLoading, setIsLoading] = useState(false)

    // Embed mode detection — force guest checkout if embedded
    const isEmbed = searchParams.get('embed') === 'true'
    const effectiveUser = isEmbed ? null : user

    // Registration state
    const requireApproval = event.require_approval === true
    const hasQuestions = registrationQuestions.length > 0
    const [regAnswers, setRegAnswers] = useState<Record<string, any>>({})
    const [registrationPending, setRegistrationPending] = useState(false)
    const [approvedRegistrationId, setApprovedRegistrationId] = useState<string | null>(
        // If user is returning post-approval, they may have it in sessionStorage
        typeof window !== 'undefined' ? sessionStorage.getItem(`approved_reg_${event.id}`) : null
    )

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
    const [organizerTermsAccepted, setOrganizerTermsAccepted] = useState(false)
    const [showOrganizerTos, setShowOrganizerTos] = useState(false)
    const [newsletterSubscribed, setNewsletterSubscribed] = useState(false)

    // Fee Logic
    const organizer = event.organizer || {}
    const passFees = organizer.pass_fees_to_customer || false
    const commissionRate = organizer.pricing_model === 'custom' && organizer.custom_percentage !== null
        ? organizer.custom_percentage / 100
        : 0.04
    const fixedFeePerTicket = parseFloat(organizer.fixed_fee_per_ticket || '15')

    const isFree = tier.price === 0
    const subtotal = tier.price * quantity
    const discount = appliedPromo ? appliedPromo.discountAmount : 0

    // Calculate Fees (if passed)
    let platformFee = 0
    let fixedFeeTotal = 0
    let processingFee = 0

    // Calculate Fees (if passed) — never charge a booking fee on free tickets
    if (passFees && !isFree) {
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
            setPromoError(result.appOnly ? 'APP_ONLY' : result.error)
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
        if (!effectiveUser && (!guestDetails.name || !guestDetails.email || !guestDetails.phone)) {
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
                description: "You must accept the HangHut Terms of Service to proceed.",
                variant: "destructive"
            })
            return
        }

        if (customTos && !organizerTermsAccepted) {
            toast({
                title: "Organizer Terms Required",
                description: `You must accept ${organizerName || 'the organizer'}'s terms to proceed.`,
                variant: "destructive"
            })
            return
        }

        // Validate required registration questions
        if ((requireApproval || hasQuestions) && !approvedRegistrationId) {
            for (const q of registrationQuestions) {
                if (q.is_required) {
                    const val = regAnswers[q.id]
                    const empty = val === undefined || val === null || val === '' ||
                        (Array.isArray(val) && val.length === 0)
                    if (empty) {
                        toast({
                            title: "Required Field Missing",
                            description: `"${q.label}" is required.`,
                            variant: "destructive"
                        })
                        return
                    }
                }
            }
        }

        // [Workaround] Subscribe directly via server action since Edge Function might miss it
        if (newsletterSubscribed && event.organizer_id) {
            const email = effectiveUser?.email || guestDetails.email
            const name = effectiveUser ? (effectiveUser.user_metadata?.full_name || effectiveUser.email) : guestDetails.name

            // Execute in background
            subscribeGuestToNewsletter(event.organizer_id, email, name).catch(err =>
                console.error("Subscription background task failed:", err)
            )
        }

        setIsLoading(true)
        const supabase = createClient()

        try {
            // ── STEP 1: For require_approval events, call submit_event_request first ──
            // Skip if user is returning with an already-approved registration_id
            let registrationId = approvedRegistrationId

            if (requireApproval && !registrationId) {
                const answers = registrationQuestions.map(q => ({
                    question_id: q.id,
                    answer: regAnswers[q.id] ?? null,
                }))

                const { data: regResult, error: regError } = await supabase.rpc('submit_event_request', {
                    p_event_id: event.id,
                    p_answers: answers,
                    p_tier_id: tier.id || null,
                    p_guest_email: !effectiveUser ? guestDetails.email : null,
                    p_guest_name: !effectiveUser ? guestDetails.name : null,
                })

                if (regError) {
                    const msg = regError.message || ''
                    if (msg.includes('already registered')) {
                        toast({ title: "Already Registered", description: "You have already submitted a registration for this event.", variant: "destructive" })
                    } else if (msg.includes('Required questions not answered')) {
                        toast({ title: "Required Fields Missing", description: "Please answer all required questions.", variant: "destructive" })
                    } else {
                        toast({ title: "Registration Failed", description: msg || "Please try again.", variant: "destructive" })
                    }
                    setIsLoading(false)
                    return
                }

                if (regResult?.status === 'pending') {
                    // Organizer must approve before payment — stop here
                    setRegistrationPending(true)
                    setIsLoading(false)
                    return
                }

                // auto_approved — proceed to checkout with the registration_id
                registrationId = regResult?.registration_id || null
            }

            // ── STEP 2: Create purchase intent ──
            const requestPayload: any = {
                event_id: event.id,
                quantity: quantity,
                tier_id: tier.id || undefined,
                guest_details: !effectiveUser ? guestDetails : undefined,
                promo_code: appliedPromo ? appliedPromo.code : undefined,
                subscribed_to_newsletter: newsletterSubscribed,
                registration_id: registrationId || undefined,
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

            const headers = !effectiveUser
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
                // Handle approval-specific 403 error codes gracefully
                const code = data.error?.code
                if (code === 'REGISTRATION_PENDING') {
                    setRegistrationPending(true)
                    setIsLoading(false)
                    return
                } else if (code === 'REGISTRATION_REQUIRED') {
                    toast({ title: "Registration Required", description: "Please complete the registration form to proceed.", variant: "destructive" })
                    setIsLoading(false)
                    return
                } else if (code === 'REGISTRATION_REJECTED') {
                    toast({ title: "Registration Not Approved", description: "Your registration for this event was not approved.", variant: "destructive" })
                    setIsLoading(false)
                    return
                } else if (code === 'REGISTRATION_INVALID' || code === 'REGISTRATION_NOT_APPROVED') {
                    toast({ title: "Registration Invalid", description: "Your registration could not be verified. Please try again.", variant: "destructive" })
                    setApprovedRegistrationId(null)
                    setIsLoading(false)
                    return
                }
                console.error('🔴 [CHECKOUT] Edge Function returned success=false:', data.error)
                throw new Error(data.error?.message || 'Failed to create order')
            }

            if (data.data?.free) {
                // Free ticket — already confirmed, go straight to success
                console.log('✅ [CHECKOUT] Free ticket confirmed, redirecting to success')
                const successUrl = `${window.location.origin}/checkout/success?intent_id=${data.data.intent_id}`
                if (isEmbed && window.self !== window.top) {
                    window.parent.postMessage({ type: 'HANGHUT_REDIRECT_PARENT', url: successUrl }, '*')
                } else {
                    window.location.href = successUrl
                }
            } else if (data.data?.payment_url) {
                console.log('✅ [CHECKOUT] Payment URL received, redirecting to:', data.data.payment_url)

                // If we're inside an embed iframe, ask the parent window to redirect
                if (isEmbed && window.self !== window.top) {
                    window.parent.postMessage({
                        type: 'HANGHUT_REDIRECT_PARENT',
                        url: data.data.payment_url,
                    }, '*')
                } else {
                    window.location.href = data.data.payment_url
                }
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

    // Pending approval state — show confirmation and stop
    if (registrationPending) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 text-center" style={themeStyle}>
                <div className="rounded-full bg-amber-100 p-6">
                    <ClipboardList className="w-12 h-12 text-amber-600" />
                </div>
                <div className="space-y-2">
                    <h2 className="text-2xl font-bold">Registration Submitted!</h2>
                    <p className="text-muted-foreground max-w-sm">
                        Your registration for <span className="font-semibold">{event.title}</span> has been submitted and is awaiting organizer approval.
                    </p>
                    <p className="text-sm text-muted-foreground">
                        You&apos;ll receive an email once your registration is approved.
                    </p>
                </div>
                <Button variant="outline" onClick={() => window.location.href = `/events/${event.id}`}>
                    Back to Event
                </Button>
            </div>
        )
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8" style={themeStyle}>
            <div className="lg:col-span-2 space-y-6">

                {/* 1. Account / Guest Info */}
                <Card className="border-border/50 shadow-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-primary">
                            <User className="w-5 h-5" />
                            {effectiveUser ? 'Your Information' : 'Guest Checkout'}
                        </CardTitle>
                        <CardDescription>
                            {effectiveUser ? 'Tickets will be sent to your registered email.' : 'Enter your details to receive tickets.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {effectiveUser ? (
                            <div className="flex items-center p-4 bg-muted/30 rounded-lg border border-border/50">
                                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mr-4">
                                    <span className="font-bold text-primary">{effectiveUser.email?.charAt(0).toUpperCase()}</span>
                                </div>
                                <div>
                                    <p className="font-medium">{effectiveUser.email}</p>
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

                {/* Registration Questions */}
                {(requireApproval || hasQuestions) && (
                    <Card className="border-border/50 shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-primary">
                                <ClipboardList className="w-5 h-5" />
                                Registration Questions
                            </CardTitle>
                            <CardDescription>
                                {requireApproval
                                    ? 'The organizer requires approval for this event. Please answer the questions below.'
                                    : 'Please answer the following questions to complete your registration.'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            {registrationQuestions.map((q) => (
                                <div key={q.id} className="space-y-2">
                                    <Label htmlFor={`q_${q.id}`}>
                                        {q.label}
                                        {q.is_required && <span className="text-destructive ml-1">*</span>}
                                    </Label>
                                    {(q.question_type === 'short_text' || q.question_type === 'url' || q.question_type === 'social_profile' || q.question_type === 'company') && (
                                        <Input
                                            id={`q_${q.id}`}
                                            placeholder={
                                                q.question_type === 'url' ? 'https://...'
                                                : q.question_type === 'social_profile' ? '@username'
                                                : q.question_type === 'company' ? 'Company name'
                                                : ''
                                            }
                                            value={regAnswers[q.id] ?? ''}
                                            onChange={(e) => setRegAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                            className="bg-muted/30"
                                        />
                                    )}
                                    {q.question_type === 'long_text' && (
                                        <textarea
                                            id={`q_${q.id}`}
                                            rows={3}
                                            className="w-full rounded-md border border-input bg-muted/30 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            value={regAnswers[q.id] ?? ''}
                                            onChange={(e) => setRegAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                        />
                                    )}
                                    {q.question_type === 'single_choice' && q.options && (
                                        <div className="space-y-2">
                                            {q.options.map((opt) => (
                                                <Label key={opt} className="flex items-center gap-3 cursor-pointer font-normal">
                                                    <input
                                                        type="radio"
                                                        name={`q_${q.id}`}
                                                        value={opt}
                                                        checked={regAnswers[q.id] === opt}
                                                        onChange={() => setRegAnswers(prev => ({ ...prev, [q.id]: opt }))}
                                                        className="h-4 w-4 text-primary"
                                                    />
                                                    {opt}
                                                </Label>
                                            ))}
                                        </div>
                                    )}
                                    {q.question_type === 'multi_choice' && q.options && (
                                        <div className="space-y-2">
                                            {q.options.map((opt) => (
                                                <Label key={opt} className="flex items-center gap-3 cursor-pointer font-normal">
                                                    <input
                                                        type="checkbox"
                                                        checked={Array.isArray(regAnswers[q.id]) && regAnswers[q.id].includes(opt)}
                                                        onChange={(e) => {
                                                            const current: string[] = Array.isArray(regAnswers[q.id]) ? regAnswers[q.id] : []
                                                            setRegAnswers(prev => ({
                                                                ...prev,
                                                                [q.id]: e.target.checked
                                                                    ? [...current, opt]
                                                                    : current.filter(v => v !== opt)
                                                            }))
                                                        }}
                                                        className="h-4 w-4 rounded text-primary"
                                                    />
                                                    {opt}
                                                </Label>
                                            ))}
                                        </div>
                                    )}
                                    {q.question_type === 'checkbox' && (
                                        <Label className="flex items-center gap-3 cursor-pointer font-normal">
                                            <input
                                                type="checkbox"
                                                checked={!!regAnswers[q.id]}
                                                onChange={(e) => setRegAnswers(prev => ({ ...prev, [q.id]: e.target.checked }))}
                                                className="h-4 w-4 rounded text-primary"
                                            />
                                            {q.label}
                                        </Label>
                                    )}
                                </div>
                            ))}
                            {requireApproval && (
                                <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <span className="text-base leading-none">⏳</span>
                                    <p>This event requires organizer approval. After submitting, you&apos;ll be notified by email when your registration is reviewed.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}
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
                                {passFees && !isFree && (
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
                            {promoError === 'APP_ONLY' ? (
                                <div className="w-full flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <span className="text-lg leading-none">📱</span>
                                    <div>
                                        <p className="font-semibold">App-Exclusive Code</p>
                                        <p className="text-xs text-amber-700 mt-0.5">This promo code can only be redeemed through the HangHut app. <a href="https://apps.apple.com/ph/app/hanghut-social-hangouts/id6764278827" target="_blank" rel="noopener noreferrer" className="underline font-medium">Download the app</a> to use it.</p>
                                    </div>
                                </div>
                            ) : promoError ? (
                                <p className="text-xs text-destructive w-full">{promoError}</p>
                            ) : null}
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
                                        I accept the <a href="/terms" target="_blank" className="underline text-primary hover:text-primary/80">HangHut Terms of Service</a>
                                        <span className="text-destructive">*</span>
                                    </span>
                                </Label>

                                {customTos && (
                                    <div className="space-y-1.5">
                                        <Label className="flex items-start gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={organizerTermsAccepted}
                                                onChange={(e) => setOrganizerTermsAccepted(e.target.checked)}
                                                className="mt-1 h-4 w-4 rounded border-primary text-primary focus:ring-primary"
                                            />
                                            <span className="text-sm">
                                                I accept <button type="button" onClick={() => setShowOrganizerTos(!showOrganizerTos)} className="underline text-primary hover:text-primary/80">{organizerName || 'Organizer'}&apos;s Terms &amp; Conditions</button>
                                                <span className="text-destructive">*</span>
                                            </span>
                                        </Label>
                                        {showOrganizerTos && (
                                            <div className="ml-7 p-3 rounded-lg bg-muted/50 border border-border/50 text-xs text-muted-foreground max-h-40 overflow-y-auto whitespace-pre-wrap">
                                                {customTos}
                                            </div>
                                        )}
                                    </div>
                                )}

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
                                    (total - discount) <= 0 ? (
                                        <>
                                            Get Free Tickets
                                            <ArrowRight className="ml-2 h-5 w-5" />
                                        </>
                                    ) : (
                                        <>
                                            Pay ₱{(total - discount).toLocaleString()}
                                            <ArrowRight className="ml-2 h-5 w-5" />
                                        </>
                                    )
                                )}
                            </Button>
                            {(total - discount) > 0 && (
                                <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
                                    <ShieldCheck className="w-3 h-3" />
                                    Secure payment processed by Xendit
                                </p>
                            )}
                        </CardFooter>
                    </Card>
                </div>
            </div>
        </div>
    )
}
