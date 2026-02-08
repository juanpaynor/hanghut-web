'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Lock, CheckCircle } from 'lucide-react'
import Link from 'next/link'

export default function ResetPasswordPage() {
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const router = useRouter()
    const searchParams = useSearchParams()
    const supabase = createClient()

    useEffect(() => {
        // Check if we have a valid session from the reset link
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                setError('Invalid or expired reset link. Please request a new password reset.')
            }
        }
        checkSession()
    }, [supabase])

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        // Validate password
        if (password.length < 8) {
            setError('Password must be at least 8 characters long')
            setLoading(false)
            return
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match')
            setLoading(false)
            return
        }

        try {
            const { error: updateError } = await supabase.auth.updateUser({
                password: password
            })

            if (updateError) {
                setError(updateError.message)
                setLoading(false)
                return
            }

            setSuccess(true)

            // Redirect after 2 seconds
            setTimeout(() => {
                router.push('/organizer/login')
            }, 2000)
        } catch (err) {
            setError('An unexpected error occurred.')
            setLoading(false)
        }
    }

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <Card className="w-full max-w-md">
                    <CardHeader className="text-center">
                        <div className="mx-auto mb-4 w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                            <CheckCircle className="h-6 w-6 text-green-600" />
                        </div>
                        <CardTitle>Password Updated!</CardTitle>
                        <CardDescription>
                            Your password has been successfully reset. Redirecting to login...
                        </CardDescription>
                    </CardHeader>
                </Card>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-2xl">Reset Password</CardTitle>
                    <CardDescription>
                        Enter your new password below
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleResetPassword} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="password">New Password</Label>
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
                                    minLength={8}
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Minimum 8 characters
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Confirm New Password</Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="confirmPassword"
                                    type="password"
                                    placeholder="••••••••"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="pl-10"
                                    required
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        {error && (
                            <Alert variant="destructive">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        <Button
                            type="submit"
                            className="w-full"
                            disabled={loading}
                        >
                            {loading ? 'Updating Password...' : 'Reset Password'}
                        </Button>

                        <div className="text-center text-sm text-muted-foreground">
                            <Link href="/organizer/login" className="text-primary hover:underline">
                                Back to Login
                            </Link>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
