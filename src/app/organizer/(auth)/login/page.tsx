'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Briefcase, Mail, Lock, ArrowRight } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'

export default function OrganizerLoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [forgotPasswordEmail, setForgotPasswordEmail] = useState('')
    const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false)
    const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState(false)
    const [forgotPasswordError, setForgotPasswordError] = useState('')
    const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false)

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        const supabase = createClient()

        const { data, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        if (signInError) {
            setError(signInError.message)
            setLoading(false)
            return
        }

        // Check if user has an approved partner account
        const { data: partner } = await supabase
            .from('partners')
            .select('status')
            .eq('user_id', data.user.id)
            .single()

        if (!partner) {
            setError('No partner account found. Please register for a partner account.')
            await supabase.auth.signOut()
            setLoading(false)
            return
        }

        if (partner.status !== 'approved') {
            setError(`Your partner application is ${partner.status}. Please wait for approval.`)
            await supabase.auth.signOut()
            setLoading(false)
            return
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
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="w-full max-w-md space-y-8">
                {/* Logo */}
                <div className="text-center">
                    <Link href="/" className="inline-block bg-primary px-6 py-3 rounded transform -rotate-1 shadow-lg mb-4 hover:scale-105 transition-transform">
                        <h1 className="font-headline font-bold text-3xl text-primary-foreground">
                            HANGHUT
                        </h1>
                    </Link>
                    <div className="flex items-center justify-center gap-2 text-muted-foreground mt-4">
                        <Briefcase className="h-5 w-5" />
                        <p className="text-lg font-medium">Event Organizer Portal</p>
                    </div>
                </div>

                {/* Login Card */}
                <Card className="p-8 shadow-xl">
                    <div className="space-y-6">
                        <div className="text-center">
                            <h2 className="text-2xl font-bold mb-2">Welcome Back!</h2>
                            <p className="text-muted-foreground">
                                Sign in to manage your events
                            </p>
                        </div>

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
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password">Password</Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="pl-10"
                                        required
                                        disabled={loading}
                                    />
                                </div>
                                <div className="text-right">
                                    <Dialog
                                        open={forgotPasswordOpen}
                                        onOpenChange={(open) => {
                                            setForgotPasswordOpen(open)
                                            if (open) {
                                                // Pre-fill with login email when opening
                                                setForgotPasswordEmail(email)
                                                setForgotPasswordSuccess(false)
                                                setForgotPasswordError('')
                                            }
                                        }}
                                    >
                                        <DialogTrigger asChild>
                                            <button
                                                type="button"
                                                className="text-sm text-primary hover:underline"
                                            >
                                                Forgot password?
                                            </button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>Reset Password</DialogTitle>
                                                <DialogDescription>
                                                    Enter your email address and we'll send you a link to reset your password.
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
                                                    <Button
                                                        type="submit"
                                                        className="w-full"
                                                        disabled={forgotPasswordLoading}
                                                    >
                                                        {forgotPasswordLoading ? 'Sending...' : 'Send Reset Link'}
                                                    </Button>
                                                </form>
                                            )}
                                        </DialogContent>
                                    </Dialog>
                                </div>
                            </div>

                            {error && (
                                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                                    <p className="text-sm text-destructive">{error}</p>
                                </div>
                            )}

                            <Button
                                type="submit"
                                className="w-full bg-primary hover:bg-primary/90"
                                size="lg"
                                disabled={loading}
                            >
                                {loading ? (
                                    'Signing in...'
                                ) : (
                                    <>
                                        Sign In
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </>
                                )}
                            </Button>
                        </form>

                        <div className="text-center space-y-2">
                            <p className="text-sm text-muted-foreground">
                                Don't have a partner account?
                            </p>
                            <p className="text-sm">
                                <Link href="/organizer/register" className="text-primary hover:underline font-medium">
                                    Create Partner Account
                                </Link>
                            </p>
                        </div>
                    </div>
                </Card>

                {/* Footer */}
                <div className="text-center text-sm text-muted-foreground">
                    <p>
                        Need help?{' '}
                        <a href="#" className="text-primary hover:underline">
                            Contact Support
                        </a>
                    </p>
                </div>
            </div>
        </div>
    )
}
