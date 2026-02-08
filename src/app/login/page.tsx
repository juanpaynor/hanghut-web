'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [forgotPasswordEmail, setForgotPasswordEmail] = useState('')
    const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false)
    const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState(false)
    const [forgotPasswordError, setForgotPasswordError] = useState('')
    const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false)
    const router = useRouter()
    const supabase = createClient()

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            // Sign in with Supabase
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            })

            if (authError) {
                setError(authError.message)
                setLoading(false)
                return
            }

            if (!authData.user) {
                setError('Login failed. Please try again.')
                setLoading(false)
                return
            }

            // Check if user is admin using RPC function
            const { data: isAdmin, error: userError } = await supabase
                .rpc('is_user_admin')

            if (userError) {
                console.error('Admin check error:', userError)
                setError('Failed to verify admin status.')
                setLoading(false)
                return
            }

            if (!isAdmin) {
                // Sign out non-admin users
                await supabase.auth.signOut()
                setError('Access denied. Admin privileges required.')
                setLoading(false)
                return
            }

            // Success - redirect to admin dashboard
            router.push('/admin')
            router.refresh()
        } catch (err) {
            setError('An unexpected error occurred.')
            setLoading(false)
        }
    }

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault()
        setForgotPasswordError('')
        setForgotPasswordSuccess(false)
        setForgotPasswordLoading(true)

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
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
            <Card className="w-full max-w-md border-slate-700 bg-slate-800/50 backdrop-blur">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl font-bold text-white">HangHut Admin</CardTitle>
                    <CardDescription className="text-slate-400">
                        Sign in to access the admin dashboard
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-slate-200">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="admin@hanghut.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                disabled={loading}
                                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-slate-200">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                disabled={loading}
                                className="bg-slate-900/50 border-slate-600 text-white"
                            />
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
                                            className="text-sm text-blue-400 hover:text-blue-300"
                                        >
                                            Forgot password?
                                        </button>
                                    </DialogTrigger>
                                    <DialogContent className="bg-slate-800 border-slate-700">
                                        <DialogHeader>
                                            <DialogTitle className="text-white">Reset Password</DialogTitle>
                                            <DialogDescription className="text-slate-400">
                                                Enter your email address and we'll send you a link to reset your password.
                                            </DialogDescription>
                                        </DialogHeader>
                                        {forgotPasswordSuccess ? (
                                            <div className="p-4 bg-green-950/50 border border-green-900 rounded-lg">
                                                <p className="text-sm text-green-400">
                                                    Password reset link sent! Check your email inbox.
                                                </p>
                                            </div>
                                        ) : (
                                            <form onSubmit={handleForgotPassword} className="space-y-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="resetEmail" className="text-slate-200">Email</Label>
                                                    <Input
                                                        id="resetEmail"
                                                        type="email"
                                                        placeholder="admin@hanghut.com"
                                                        value={forgotPasswordEmail}
                                                        onChange={(e) => setForgotPasswordEmail(e.target.value)}
                                                        className="bg-slate-900/50 border-slate-600 text-white"
                                                        required
                                                        disabled={forgotPasswordLoading}
                                                    />
                                                </div>
                                                {forgotPasswordError && (
                                                    <Alert variant="destructive" className="bg-red-950/50 border-red-900">
                                                        <AlertDescription>{forgotPasswordError}</AlertDescription>
                                                    </Alert>
                                                )}
                                                <Button
                                                    type="submit"
                                                    className="w-full bg-blue-600 hover:bg-blue-700"
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
                            <Alert variant="destructive" className="bg-red-950/50 border-red-900">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
                        <Button
                            type="submit"
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                            disabled={loading}
                        >
                            {loading ? 'Signing in...' : 'Sign In'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div >
    )
}
