'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft, Loader2, Smartphone, Download } from 'lucide-react'
import { useLoginRateLimit } from '@/hooks/use-login-rate-limit'

function ExperienceLoginForm() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const router = useRouter()
    const searchParams = useSearchParams()
    const supabase = createClient()
    const { isLocked, remainingTime, recordAttempt, resetAttempts } = useLoginRateLimit(5, 60000)

    const nextUrl = searchParams.get('next') || '/experiences'

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        if (isLocked) {
            setError(`Too many failed attempts. Please try again in ${remainingTime} seconds.`)
            setLoading(false)
            return
        }

        try {
            const { data, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            })

            if (authError || !data.user) {
                recordAttempt()
                setError('Invalid email or password.')
                setLoading(false)
                return
            }

            resetAttempts()
            router.push(nextUrl)
            router.refresh()
        } catch {
            setError('An unexpected error occurred.')
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-background flex flex-col">
            {/* Navbar */}
            <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur">
                <div className="container mx-auto px-4 flex h-14 items-center gap-3">
                    <Link href="/" className="flex items-center gap-2 font-bold text-xl hover:opacity-80 transition-opacity">
                        <div className="bg-primary px-3 py-1 rounded-md text-primary-foreground transform -rotate-2 text-base">
                            HANGHUT
                        </div>
                    </Link>
                    <span className="text-muted-foreground text-sm hidden sm:block">/ Experiences</span>
                </div>
            </header>

            <main className="flex-1 flex items-center justify-center p-4">
                <div className="w-full max-w-md space-y-6">

                    <Link
                        href={nextUrl}
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Back to experience
                    </Link>

                    {/* Login Card */}
                    <Card className="border-2">
                        <CardHeader className="text-center pb-2">
                            <CardTitle className="text-2xl font-bold">Sign in to book</CardTitle>
                            <CardDescription>
                                Log in with your HangHut account to book this experience
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleLogin} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="you@example.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        disabled={loading}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="password">Password</Label>
                                    <Input
                                        id="password"
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        disabled={loading}
                                    />
                                </div>
                                {error && (
                                    <Alert variant="destructive">
                                        <AlertDescription>{error}</AlertDescription>
                                    </Alert>
                                )}
                                <Button
                                    type="submit"
                                    className="w-full h-11 font-semibold"
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…
                                        </>
                                    ) : (
                                        'Sign In'
                                    )}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    {/* Divider */}
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-border" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-3 text-muted-foreground">
                                Don&apos;t have an account?
                            </span>
                        </div>
                    </div>

                    {/* Download App Card */}
                    <Card className="border-2 border-dashed border-primary/30 bg-primary/5">
                        <CardContent className="pt-6 text-center space-y-4">
                            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                                <Smartphone className="h-6 w-6 text-primary" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg">Get the HangHut App</h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Create your account by downloading the app. It&apos;s free!
                                </p>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                <Button
                                    variant="outline"
                                    className="gap-2 h-11"
                                    onClick={() => window.open('#', '_blank')}
                                >
                                    <Download className="h-4 w-4" />
                                    App Store
                                </Button>
                                <Button
                                    variant="outline"
                                    className="gap-2 h-11"
                                    onClick={() => window.open('#', '_blank')}
                                >
                                    <Download className="h-4 w-4" />
                                    Google Play
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">Coming soon — we&apos;re in beta!</p>
                        </CardContent>
                    </Card>

                </div>
            </main>
        </div>
    )
}

export default function ExperienceLoginPage() {
    return (
        <Suspense>
            <ExperienceLoginForm />
        </Suspense>
    )
}
