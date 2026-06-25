'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    Building, Mail, Lock, ArrowRight, CheckCircle, Briefcase, Eye, EyeOff, User, Phone, ShieldCheck,
} from 'lucide-react'
import Link from 'next/link'
import { registerPartner, completePartnerApplication } from '@/lib/organizer/auth-actions'
import { ENTITY_TYPES } from '@/lib/organizer/kyc-constants'
import { createClient } from '@/lib/supabase/client'
import { OAuthButtons } from '@/components/auth/oauth-buttons'

export default function OrganizerRegisterPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)
    const [showPassword, setShowPassword] = useState(false)

    const [businessName, setBusinessName] = useState('')
    const [businessType, setBusinessType] = useState('')
    const [representativeName, setRepresentativeName] = useState('')
    const [countryCode, setCountryCode] = useState('+63')
    const [phoneNumber, setPhoneNumber] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')

    // OAuth "finish application" mode: the user already authenticated with
    // Google/Apple and just needs to provide business details (no email/password).
    const [oauthMode, setOauthMode] = useState(false)
    const [oauthEmail, setOauthEmail] = useState('')

    useEffect(() => {
        const supabase = createClient()
        supabase.auth.getUser().then(async ({ data: { user } }) => {
            if (!user) return
            const { data: partner } = await supabase
                .from('partners').select('id').eq('user_id', user.id).maybeSingle()
            if (partner) { router.push('/organizer'); return } // already a partner
            setOauthMode(true)
            setOauthEmail(user.email ?? '')
            const name = (user.user_metadata?.full_name || user.user_metadata?.name || '') as string
            if (name) setRepresentativeName(name)
        })
    }, [router])

    const isValid = oauthMode
        ? Boolean(businessName.trim() && businessType && representativeName.trim() && phoneNumber.trim())
        : Boolean(businessName.trim() && businessType && representativeName.trim() &&
            phoneNumber.trim() && email.trim() && password.length >= 6 && password === confirmPassword)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError('')

        const formData = new FormData()
        formData.append('businessName', businessName)
        formData.append('businessType', businessType)
        formData.append('representativeName', representativeName)
        formData.append('phoneNumber', `${countryCode}${phoneNumber}`)

        setLoading(true)

        let result: { error?: string; success?: boolean }
        if (oauthMode) {
            result = await completePartnerApplication(formData)
        } else {
            if (password !== confirmPassword) { setError('Passwords do not match'); setLoading(false); return }
            if (password.length < 6) { setError('Password must be at least 6 characters'); setLoading(false); return }
            formData.append('email', email)
            formData.append('password', password)
            result = await registerPartner(formData)
        }

        if (result.error) {
            setError(result.error)
            setLoading(false)
        } else {
            // New partners can't enter the dashboard until approved (same as the
            // password flow) — sign the OAuth session out so they hit the gate.
            if (oauthMode) {
                await createClient().auth.signOut()
            }
            setSuccess(true)
            setLoading(false)
            setTimeout(() => router.push('/organizer/login'), 3500)
        }
    }

    if (success) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <Card className="max-w-md w-full p-10 text-center space-y-6 shadow-2xl border-green-200/50">
                    <div className="mx-auto w-20 h-20 bg-green-50 rounded-full flex items-center justify-center animate-in zoom-in duration-500">
                        <CheckCircle className="h-10 w-10 text-green-500" />
                    </div>
                    <div className="space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
                        <h2 className="text-2xl font-bold">{oauthMode ? 'Application submitted 🎉' : 'Account created 🎉'}</h2>
                        <p className="text-muted-foreground">
                            {oauthMode ? (
                                <>Your partner application is <strong className="text-foreground">pending approval</strong>. We&apos;ll email you once it&apos;s approved.</>
                            ) : (
                                <>Next up: <strong className="text-foreground">get verified</strong> from your dashboard to start accepting GCash &amp; card payments.</>
                            )}
                        </p>
                    </div>
                    <Button asChild size="lg" className="w-full animate-in fade-in duration-500 delay-500">
                        <Link href="/organizer/login">Sign in to your dashboard</Link>
                    </Button>
                </Card>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4 py-12">
            <div className="w-full max-w-md space-y-6">
                {/* Logo */}
                <div className="text-center">
                    <Link href="/" className="inline-block bg-primary px-6 py-3 rounded transform -rotate-1 shadow-lg mb-3 hover:scale-105 transition-transform">
                        <h1 className="font-headline font-bold text-3xl text-primary-foreground">HANGHUT</h1>
                    </Link>
                    <div className="flex items-center justify-center gap-2 text-muted-foreground mt-3">
                        <Briefcase className="h-4 w-4" />
                        <p className="text-sm font-medium">Become a Partner</p>
                    </div>
                </div>

                <Card className="p-8 shadow-xl">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <h2 className="text-xl font-bold">{oauthMode ? 'Finish your partner application' : 'Create your account'}</h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                {oauthMode ? (
                                    <>Signed in as <strong className="text-foreground">{oauthEmail}</strong>. Just a few business details and you&apos;re set.</>
                                ) : (
                                    <>Takes a minute. You&apos;ll verify your business later from your dashboard.</>
                                )}
                            </p>
                        </div>

                        {!oauthMode && (
                            <>
                                <OAuthButtons disabled={loading} />
                                <div className="relative flex items-center">
                                    <div className="flex-grow border-t border-border" />
                                    <span className="mx-3 text-xs uppercase tracking-wide text-muted-foreground">or sign up with email</span>
                                    <div className="flex-grow border-t border-border" />
                                </div>
                            </>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="businessName">Business / Organization Name</Label>
                            <div className="relative">
                                <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input id="businessName" value={businessName} onChange={(e) => setBusinessName(e.target.value)}
                                    placeholder="Acme Events Inc." className="pl-10" required />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Business Type</Label>
                            <Select value={businessType} onValueChange={setBusinessType}>
                                <SelectTrigger><SelectValue placeholder="Select business type" /></SelectTrigger>
                                <SelectContent>
                                    {ENTITY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="representativeName">Your Full Name</Label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input id="representativeName" value={representativeName} onChange={(e) => setRepresentativeName(e.target.value)}
                                    placeholder="Juan Dela Cruz" className="pl-10" required />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="phoneNumber">Phone Number</Label>
                            <div className="flex gap-2">
                                <Select value={countryCode} onValueChange={setCountryCode}>
                                    <SelectTrigger className="w-[100px] shrink-0"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="+63">🇵🇭 +63</SelectItem>
                                        <SelectItem value="+1">🇺🇸 +1</SelectItem>
                                        <SelectItem value="+65">🇸🇬 +65</SelectItem>
                                        <SelectItem value="+61">🇦🇺 +61</SelectItem>
                                        <SelectItem value="+44">🇬🇧 +44</SelectItem>
                                    </SelectContent>
                                </Select>
                                <div className="relative flex-1">
                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input id="phoneNumber" type="tel" value={phoneNumber}
                                        onChange={(e) => setPhoneNumber(e.target.value.replace(/[^0-9]/g, ''))}
                                        placeholder="9171234567" className="pl-10" required />
                                </div>
                            </div>
                        </div>

                        {!oauthMode && (
                        <div className="border-t pt-4 space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">Work Email</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                                        placeholder="events@company.com" className="pl-10" required={!oauthMode} />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label htmlFor="password">Password</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input id="password" type={showPassword ? 'text' : 'password'} value={password}
                                            onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="pl-10 pr-10" required={!oauthMode} />
                                        <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                            onClick={() => setShowPassword(!showPassword)}>
                                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="confirmPassword">Confirm</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input id="confirmPassword" type={showPassword ? 'text' : 'password'} value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" className="pl-10" required={!oauthMode} />
                                    </div>
                                    {confirmPassword && password !== confirmPassword && (
                                        <p className="text-xs text-destructive">Passwords don&apos;t match</p>
                                    )}
                                </div>
                            </div>
                        </div>
                        )}

                        {error && (
                            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl">
                                <p className="text-sm text-destructive">{error}</p>
                            </div>
                        )}

                        <Button type="submit" disabled={loading || !isValid} className="w-full" size="lg">
                            {loading
                                ? (oauthMode ? 'Submitting…' : 'Creating account…')
                                : (<>{oauthMode ? 'Submit application' : 'Create account'} <ArrowRight className="ml-2 h-4 w-4" /></>)}
                        </Button>

                        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
                            <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                            <span>Identity &amp; business verification (for GCash and card payments) happens after signup, in your dashboard — no documents needed right now.</span>
                        </div>
                    </form>
                </Card>

                <div className="text-center">
                    <p className="text-sm text-muted-foreground">
                        Already have an account?{' '}
                        <Link href="/organizer/login" className="text-primary hover:underline font-medium">Sign in</Link>
                    </p>
                </div>
            </div>
        </div>
    )
}
