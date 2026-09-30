'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useLoginRateLimit } from '@/hooks/use-login-rate-limit'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Briefcase, Mail, Lock, ArrowRight, Loader2, Eye, EyeOff, Check } from 'lucide-react'
import { useLoading } from '@/providers/loading-provider'
import { OAuthButtons } from '@/components/auth/oauth-buttons'
import { StageArt } from '@/components/auth/stage-art'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'

const EASE = [0.22, 1, 0.36, 1] as const

/**
 * Mount reveal for one block of the sign-in screen.
 *
 * `animate`, not `whileInView` like the landing Reveal: everything here is above
 * the fold, so an in-view trigger would either fire all at once anyway or, worse,
 * never fire on a short viewport and leave the form invisible. Reduced-motion
 * viewers get the plain element — no wrapper, no transform, no delay.
 */
function Rise({
    children, delay = 0, reduce, className,
}: {
    children: React.ReactNode
    delay?: number
    reduce: boolean
    className?: string
}) {
    if (reduce) return <div className={className}>{children}</div>
    return (
        <motion.div
            className={className}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay, ease: EASE }}
        >
            {children}
        </motion.div>
    )
}

const VALUE_PROPS = [
    'No monthly fees. No lock-in.',
    'Fast, reliable payouts',
    'Free seat-map builder',
    'Built-in email marketing & analytics',
]

export default function OrganizerLoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [notice, setNotice] = useState('')
    const [forgotPasswordEmail, setForgotPasswordEmail] = useState('')
    const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false)
    const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState(false)
    const [forgotPasswordError, setForgotPasswordError] = useState('')
    const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false)
    const { isLocked, remainingTime, recordAttempt, resetAttempts } = useLoginRateLimit(5, 60000)
    const { showLoading, hideLoading } = useLoading()
    // `?? false` because useReducedMotion returns null until it has read the
    // media query — treating null as "reduce" would skip the animation on the
    // first paint for everyone.
    const reduce = useReducedMotion() ?? false

    // Surface notices/errors forwarded by the OAuth gate or auth callback.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const n = params.get('notice')
        const e = params.get('error')
        if (n) setNotice(n)
        if (e) setError(e)
    }, [])

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setNotice('')

        if (isLocked) {
            setError(`Too many failed attempts. Please try again in ${remainingTime} seconds.`)
            return
        }

        setLoading(true)
        // Full-screen branded overlay — stays up through the redirect to the
        // dashboard (the provider auto-hides it once /organizer renders).
        showLoading('Signing you in…')

        const supabase = createClient()

        const { data, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        if (signInError) {
            console.error('Login error:', signInError.message) // Keep internal log
            recordAttempt()
            setError('Invalid email or password.') // Generic message
            setLoading(false)
            hideLoading()
            return
        }

        // Reset attempts on successful auth (even if partner check fails, they proved identity)
        resetAttempts()

        // Check if user has an approved partner account OR is a team member
        const { data: partner, error: partnerError } = await supabase
            .from('partners')
            .select('status')
            .eq('user_id', data.user.id)
            .maybeSingle()

        console.log('[Login] Partner check:', { userId: data.user.id, partner, partnerError })

        if (partner) {
            // User is a partner owner — check approval status
            if (partner.status !== 'approved') {
                setError(`Your partner application is ${partner.status}. Please wait for approval.`)
                await supabase.auth.signOut()
                setLoading(false)
                hideLoading()
                return
            }
        } else {
            // Not an owner — check if they're a team member
            const { data: teamMember } = await supabase
                .from('partner_team_members')
                .select('partner_id')
                .eq('user_id', data.user.id)
                .maybeSingle()

            if (!teamMember) {
                setError('No partner account found. If you applied as an experience host via the app, please wait for approval. Otherwise, register a partner account or ask your team admin to invite you.')
                await supabase.auth.signOut()
                setLoading(false)
                hideLoading()
                return
            }
        }

        // Success - redirect to organizer dashboard
        router.push('/organizer')
        router.refresh()
    }

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault()
        setForgotPasswordError('')
        setForgotPasswordSuccess(false)
        setForgotPasswordLoading(true)

        const supabase = createClient()

        const { error } = await supabase.auth.resetPasswordForEmail(forgotPasswordEmail, {
            redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`
        })

        setForgotPasswordLoading(false)

        if (error) {
            setForgotPasswordError(error.message)
            return
        }

        setForgotPasswordSuccess(true)
    }

    return (
        <div className="min-h-screen flex">
            {/* ── Left: branded panel (desktop only) ───────────────────── */}
            <div className="hidden lg:flex lg:w-[44%] relative overflow-hidden flex-col justify-between p-12 bg-primary text-primary-foreground">
                <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-purple-700" />
                <div className="absolute inset-0 bg-noise opacity-20" />

                {/* The art carries the panel's colour now. The three blurred
                    aurora blobs that used to sit here were both redundant against
                    its screen-blended colour field and the most expensive thing on
                    the page — blur-3xl on large elements is a real cost on low-end
                    phones, for a layer nobody could see once this went in front. */}
                <StageArt reduce={reduce} />

                <Rise reduce={reduce} className="relative z-10">
                    <Link href="/" className="inline-block bg-white px-5 py-2.5 rounded transform -rotate-1 shadow-lg transition-transform hover:scale-105 hover:-rotate-2">
                        <span className="font-headline font-bold text-2xl text-primary">HANGHUT</span>
                    </Link>
                </Rise>

                <div className="relative z-10 space-y-6">
                    <Rise reduce={reduce} delay={0.1}>
                        <h1 className="font-headline text-4xl font-black leading-tight tracking-tight">
                            Grow your events<br />with HangHut.
                        </h1>
                    </Rise>
                    <ul className="space-y-3">
                        {VALUE_PROPS.map((v, i) => (
                            <motion.li
                                key={v}
                                className="flex items-center gap-3 text-primary-foreground/90"
                                initial={reduce ? false : { opacity: 0, x: -12 }}
                                animate={reduce ? undefined : { opacity: 1, x: 0 }}
                                transition={{ duration: 0.45, delay: 0.22 + i * 0.08, ease: EASE }}
                            >
                                <motion.span
                                    className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20"
                                    initial={reduce ? false : { scale: 0.4, opacity: 0 }}
                                    animate={reduce ? undefined : { scale: 1, opacity: 1 }}
                                    transition={{ duration: 0.35, delay: 0.3 + i * 0.08, ease: EASE }}
                                >
                                    <Check className="h-3.5 w-3.5" />
                                </motion.span>
                                <span className="font-medium">{v}</span>
                            </motion.li>
                        ))}
                    </ul>
                </div>

                <Rise reduce={reduce} delay={0.6} className="relative z-10">
                    <p className="text-sm text-primary-foreground/70">
                        The all-in-one platform for organizers in the Philippines.
                    </p>
                </Rise>
            </div>

            {/* ── Right: form ──────────────────────────────────────────── */}
            <div className="flex-1 flex items-center justify-center p-6 sm:p-10" style={{ backgroundColor: '#FAFAF8' }}>
                <div className="w-full max-w-md space-y-6">
                    {/* Mobile logo */}
                    <Rise reduce={reduce} className="lg:hidden text-center">
                        <Link href="/" className="inline-block bg-primary px-5 py-2.5 rounded transform -rotate-1 shadow-lg mb-3">
                            <span className="font-headline font-bold text-2xl text-primary-foreground">HANGHUT</span>
                        </Link>
                    </Rise>

                    <Rise reduce={reduce} delay={0.06}>
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                            <Briefcase className="h-4 w-4" />
                            <span className="text-sm font-medium uppercase tracking-wide">Partner Portal</span>
                        </div>
                        <h2 className="text-3xl font-headline font-bold">Welcome back</h2>
                        <p className="text-muted-foreground mt-1">Sign in to your partner dashboard</p>
                    </Rise>

                    {/*
                      * Height-animated so the form below slides rather than jumps.
                      * A message that appears instantly under a field the user is
                      * still looking at is easy to miss — and worse, it shifts the
                      * Sign In button out from under the cursor mid-click.
                      */}
                    <AnimatePresence initial={false}>
                        {notice && (
                            <motion.div
                                key="notice"
                                className="overflow-hidden"
                                initial={reduce ? false : { opacity: 0, height: 0 }}
                                animate={reduce ? undefined : { opacity: 1, height: 'auto' }}
                                exit={reduce ? undefined : { opacity: 0, height: 0 }}
                                transition={{ duration: 0.3, ease: EASE }}
                            >
                                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                                    <p className="text-sm text-amber-700">{notice}</p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <Rise reduce={reduce} delay={0.12}>
                        <OAuthButtons disabled={loading} />
                    </Rise>

                    <Rise reduce={reduce} delay={0.18} className="relative flex items-center">
                        <div className="flex-grow border-t border-border" />
                        <span className="mx-3 text-xs uppercase tracking-wide text-muted-foreground">or</span>
                        <div className="flex-grow border-t border-border" />
                    </Rise>

                    <Rise reduce={reduce} delay={0.24}>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="your@email.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="pl-10"
                                    required
                                    disabled={loading}
                                    autoComplete="email"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password">Password</Label>
                                <Dialog
                                    open={forgotPasswordOpen}
                                    onOpenChange={(open) => {
                                        setForgotPasswordOpen(open)
                                        if (open) {
                                            setForgotPasswordEmail(email)
                                            setForgotPasswordSuccess(false)
                                            setForgotPasswordError('')
                                        }
                                    }}
                                >
                                    <DialogTrigger asChild>
                                        <button type="button" className="text-sm text-primary hover:underline">
                                            Forgot password?
                                        </button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Reset Password</DialogTitle>
                                            <DialogDescription>
                                                Enter your email address and we&apos;ll send you a link to reset your password.
                                            </DialogDescription>
                                        </DialogHeader>
                                        {forgotPasswordSuccess ? (
                                            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                                                <p className="text-sm text-green-800">
                                                    Password reset link sent! Check your email inbox.
                                                </p>
                                            </div>
                                        ) : (
                                            <form onSubmit={handleForgotPassword} className="space-y-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="resetEmail">Email</Label>
                                                    <Input
                                                        id="resetEmail"
                                                        type="email"
                                                        placeholder="your@email.com"
                                                        value={forgotPasswordEmail}
                                                        onChange={(e) => setForgotPasswordEmail(e.target.value)}
                                                        required
                                                        disabled={forgotPasswordLoading}
                                                    />
                                                </div>
                                                {forgotPasswordError && (
                                                    <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                                                        <p className="text-sm text-destructive">{forgotPasswordError}</p>
                                                    </div>
                                                )}
                                                <Button type="submit" className="w-full" disabled={forgotPasswordLoading}>
                                                    {forgotPasswordLoading ? 'Sending...' : 'Send Reset Link'}
                                                </Button>
                                            </form>
                                        )}
                                    </DialogContent>
                                </Dialog>
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="pl-10 pr-10"
                                    required
                                    disabled={loading}
                                    autoComplete="current-password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((s) => !s)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        <AnimatePresence initial={false}>
                            {error && (
                                <motion.div
                                    key="error"
                                    className="overflow-hidden"
                                    initial={reduce ? false : { opacity: 0, height: 0 }}
                                    animate={reduce ? undefined : { opacity: 1, height: 'auto' }}
                                    exit={reduce ? undefined : { opacity: 0, height: 0 }}
                                    transition={{ duration: 0.3, ease: EASE }}
                                >
                                    <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                                        <p className="text-sm text-destructive">{error}</p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <Button
                            type="submit"
                            className="group w-full bg-primary hover:bg-primary/90"
                            size="lg"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Signing in...
                                </>
                            ) : (
                                <>
                                    Sign In
                                    <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                                </>
                            )}
                        </Button>
                    </form>
                    </Rise>

                    <Rise reduce={reduce} delay={0.3} className="text-center space-y-1.5">
                        <p className="text-sm text-muted-foreground">
                            New here?{' '}
                            <Link href="/organizer/register" className="text-primary hover:underline font-medium">
                                Create a partner account
                            </Link>
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Experience host? Apply via the HangHut app.
                        </p>
                        <p className="text-xs text-muted-foreground pt-2">
                            Need help?{' '}
                            <a href="mailto:support@hanghut.com" className="text-primary hover:underline">
                                Contact Support
                            </a>
                        </p>
                    </Rise>
                </div>
            </div>
        </div>
    )
}
