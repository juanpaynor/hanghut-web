'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useLoginRateLimit } from '@/hooks/use-login-rate-limit'
import { Headset } from 'lucide-react'

export default function SupportLoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const router = useRouter()
    const supabase = createClient()
    const { isLocked, remainingTime, recordAttempt, resetAttempts } = useLoginRateLimit(5, 60000)

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        if (isLocked) {
            setError(`Too many failed attempts. Please try again in ${remainingTime} seconds.`)
            return
        }

        try {
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            })

            if (authError) {
                recordAttempt()
                setError('Invalid email or password.')
                setLoading(false)
                return
            }

            if (!authData.user) {
                recordAttempt()
                setError('Invalid email or password.')
                setLoading(false)
                return
            }

            resetAttempts()

            // Check admin role
            const { data: adminRole, error: userError } = await supabase
                .rpc('is_user_admin')

            if (userError) {
                setError('Failed to verify access.')
                setLoading(false)
                return
            }

            if (!adminRole) {
                await supabase.auth.signOut()
                setError('Access denied. Support privileges required.')
                setLoading(false)
                return
            }

            // Only allow support and finance_admin roles
            if (adminRole !== 'support' && adminRole !== 'finance_admin') {
                await supabase.auth.signOut()
                setError('Admins should log in at the admin portal.')
                setLoading(false)
                return
            }

            // Send OTP code for 2FA
            try {
                const { sendOtpCode } = await import('@/lib/admin/otp-actions')
                const result = await sendOtpCode(authData.user.id)

                document.cookie = `pending_2fa_user=${authData.user.id}; path=/; max-age=600`
                document.cookie = `pending_2fa_email=${encodeURIComponent(result.maskedEmail)}; path=/; max-age=600`

                router.push('/verify')
            } catch (otpErr: any) {
                console.error('OTP error:', otpErr)
                setError(otpErr.message || 'Failed to send verification code')
                setLoading(false)
            }
        } catch (err) {
            setError('An unexpected error occurred.')
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
            <Card className="w-full max-w-md border-slate-700 bg-slate-800/50 backdrop-blur">
                <CardHeader className="space-y-1">
                    <div className="flex items-center gap-2 mb-1">
                        <Headset className="h-5 w-5 text-indigo-400" />
                        <span className="text-xs font-medium text-indigo-400 uppercase tracking-wider">Support Portal</span>
                    </div>
                    <CardTitle className="text-2xl font-bold text-white">HangHut Support</CardTitle>
                    <CardDescription className="text-slate-400">
                        Sign in with your support team credentials
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-slate-200">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="support@hanghut.com"
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
                        </div>
                        {error && (
                            <Alert variant="destructive" className="bg-red-950/50 border-red-900">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
                        <Button
                            type="submit"
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                            disabled={loading}
                        >
                            {loading ? 'Signing in...' : 'Sign In'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
