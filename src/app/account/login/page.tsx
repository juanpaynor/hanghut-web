'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, Mail, Lock, Eye, EyeOff, ArrowLeft, Smartphone } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { StoreButtons } from '@/components/landing/store-buttons'

function LoginForm() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const next = searchParams.get('next') || '/'
    const supabase = createClient()

    const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [forgotSent, setForgotSent] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setLoading(true)

        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
            setError('Incorrect email or password.')
            setLoading(false)
            return
        }
        router.push(next)
        router.refresh()
    }

    return (
        <div className="min-h-screen bg-background flex flex-col">
            {/* Back link */}
            <div className="p-4">
                <Link
                    href={next}
                    prefetch={false}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                </Link>
            </div>

            <div className="flex-1 flex items-center justify-center p-4">
                <div className="w-full max-w-sm space-y-8">
                    {/* Logo + heading */}
                    <div className="text-center space-y-2">
                        <div className="inline-flex items-center justify-center bg-primary px-4 py-2 rounded-xl transform -rotate-1 mb-4">
                            <span className="font-bold text-lg text-primary-foreground tracking-wide">HANGHUT</span>
                        </div>
                        <h1 className="text-2xl font-bold">
                            {mode === 'signin' ? 'Welcome back' : 'Join HangHut'}
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            {mode === 'signin'
                                ? 'Sign in to subscribe to your favourite organisers'
                                : 'Create an account to unlock exclusive content'
                            }
                        </p>
                    </div>

                    {/* Mode toggle — hidden in forgot flow */}
                    <div className={cn('flex bg-muted rounded-xl p-1', mode === 'forgot' && 'hidden')}>
                        {(['signin', 'signup'] as const).map(m => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => { setMode(m); setError(null) }}
                                className={cn(
                                    'flex-1 py-2 text-sm font-medium rounded-lg transition-all',
                                    mode === m
                                        ? 'bg-background shadow-sm text-foreground'
                                        : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                {m === 'signin' ? 'Sign In' : 'Sign Up'}
                            </button>
                        ))}
                    </div>

                    {/* Sign In form */}
                    {mode === 'signin' && (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="email">Email</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="juan@example.com"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        disabled={loading}
                                        autoComplete="email"
                                        className="pl-9"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="password">Password</Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        disabled={loading}
                                        autoComplete="current-password"
                                        className="pl-9 pr-9"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(v => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                                <div className="text-right">
                                    <button
                                        type="button"
                                        onClick={() => { setMode('forgot'); setError(null); setForgotSent(false) }}
                                        className="text-xs text-muted-foreground hover:text-primary transition-colors"
                                    >
                                        Forgot password?
                                    </button>
                                </div>
                            </div>

                            {error && (
                                <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                                    {error}
                                </p>
                            )}

                            <Button type="submit" className="w-full" size="lg" disabled={loading}>
                                {loading
                                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Signing in…</>
                                    : 'Sign In'
                                }
                            </Button>
                        </form>
                    )}

                    {/* Forgot password */}
                    {mode === 'forgot' && (
                        <div className="space-y-4">
                            {forgotSent ? (
                                <div className="text-center space-y-4 py-2">
                                    <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                                        <Mail className="h-7 w-7 text-green-600" />
                                    </div>
                                    <div>
                                        <p className="font-semibold">Check your inbox</p>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            We sent a password reset link to <span className="font-medium text-foreground">{email}</span>
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => { setMode('signin'); setForgotSent(false) }}
                                        className="text-sm text-primary hover:underline"
                                    >
                                        Back to Sign In
                                    </button>
                                </div>
                            ) : (
                                <form
                                    onSubmit={async (e) => {
                                        e.preventDefault()
                                        setError(null)
                                        setLoading(true)
                                        const { error } = await supabase.auth.resetPasswordForEmail(email, {
                                            redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
                                        })
                                        setLoading(false)
                                        if (error) { setError(error.message); return }
                                        setForgotSent(true)
                                    }}
                                    className="space-y-4"
                                >
                                    <div className="space-y-1">
                                        <p className="font-semibold">Reset your password</p>
                                        <p className="text-sm text-muted-foreground">Enter your email and we'll send you a reset link.</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="forgot-email">Email</Label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                id="forgot-email"
                                                type="email"
                                                placeholder="juan@example.com"
                                                value={email}
                                                onChange={e => setEmail(e.target.value)}
                                                className="pl-9"
                                                required
                                                disabled={loading}
                                            />
                                        </div>
                                    </div>
                                    {error && (
                                        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                                            {error}
                                        </p>
                                    )}
                                    <Button type="submit" className="w-full" disabled={loading}>
                                        {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</> : 'Send Reset Link'}
                                    </Button>
                                    <button
                                        type="button"
                                        onClick={() => { setMode('signin'); setError(null) }}
                                        className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        Back to Sign In
                                    </button>
                                </form>
                            )}
                        </div>
                    )}

                    {/* Sign Up — download prompt */}
                    {mode === 'signup' && (
                        <div className="space-y-6 text-center">
                            <div className="flex justify-center">
                                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                                    <Smartphone className="h-8 w-8 text-primary" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <p className="font-semibold text-lg">Get the HangHut app</p>
                                <p className="text-muted-foreground text-sm leading-relaxed">
                                    Create your account on the HangHut app — then come back here to subscribe to your favourite organisers.
                                </p>
                            </div>
                            <StoreButtons variant="dark" className="justify-center" />
                        </div>
                    )}

                    <p className="text-center text-xs text-muted-foreground">
                        By continuing you agree to HangHut's{' '}
                        <Link href="/terms" className="underline hover:text-foreground">Terms</Link>
                        {' '}and{' '}
                        <Link href="/privacy-policy" className="underline hover:text-foreground">Privacy Policy</Link>
                    </p>
                </div>
            </div>
        </div>
    )
}

export default function AccountLoginPage() {
    return (
        <Suspense>
            <LoginForm />
        </Suspense>
    )
}
