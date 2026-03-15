'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle, XCircle, AlertTriangle, Building2, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { acceptInvite, getInviteInfo } from '@/lib/organizer/team-actions'
import { createClient } from '@/lib/supabase/client'

const ROLE_LABELS: Record<string, string> = {
    owner: 'Owner',
    manager: 'Manager',
    scanner: 'Scanner',
    finance: 'Finance',
    marketing: 'Marketing',
}

type PageState = 'loading' | 'show_invite' | 'accepting' | 'success' | 'already_member' | 'error' | 'no_token'
type AuthMode = 'choose' | 'login' | 'signup'

export default function AcceptInvitePage() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const token = searchParams.get('token')
    const supabase = createClient()

    const [status, setStatus] = useState<PageState>('loading')
    const [authMode, setAuthMode] = useState<AuthMode>('choose')
    const [errorMessage, setErrorMessage] = useState('')
    const [isLoggedIn, setIsLoggedIn] = useState(false)

    // Invite info
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteRole, setInviteRole] = useState('')
    const [orgName, setOrgName] = useState('')
    const [orgLogo, setOrgLogo] = useState<string | null>(null)

    // Auth form fields
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [authLoading, setAuthLoading] = useState(false)
    const [authError, setAuthError] = useState('')

    // 1. On mount: fetch invite info + check auth
    useEffect(() => {
        if (!token) {
            setStatus('no_token')
            return
        }

        async function init() {
            // Fetch invite details (no auth needed)
            const info = await getInviteInfo(token!)
            if (info.error) {
                setErrorMessage(info.error)
                setStatus('error')
                return
            }

            setInviteEmail(info.email || '')
            setInviteRole(info.role || '')
            setOrgName(info.organizationName || '')
            setOrgLogo(info.organizationLogo || null)
            setEmail(info.email || '')

            // Check if user is logged in
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                setIsLoggedIn(true)
                // Auto-accept
                await handleAccept()
            } else {
                setStatus('show_invite')
            }
        }

        init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token])

    // 2. Accept the invite (requires auth)
    const handleAccept = async () => {
        setStatus('accepting')
        const result = await acceptInvite(token!)

        if (result.error) {
            setErrorMessage(result.error)
            setStatus('error')
        } else if (result.alreadyMember) {
            setStatus('already_member')
        } else {
            setStatus('success')
            setTimeout(() => router.push('/organizer'), 2000)
        }
    }

    // 3. Login handler
    const handleLogin = async () => {
        setAuthLoading(true)
        setAuthError('')

        const { error } = await supabase.auth.signInWithPassword({ email, password })

        if (error) {
            setAuthError(error.message)
            setAuthLoading(false)
        } else {
            setIsLoggedIn(true)
            await handleAccept()
        }
    }

    // 4. Signup handler
    const handleSignup = async () => {
        if (!displayName.trim()) {
            setAuthError('Please enter your name')
            return
        }
        setAuthLoading(true)
        setAuthError('')

        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { display_name: displayName },
                emailRedirectTo: `${window.location.origin}/organizer/accept-invite?token=${token}`,
            }
        })

        if (error) {
            setAuthError(error.message)
            setAuthLoading(false)
        } else {
            // Auto-login after signup (if email confirmation is off)
            // Try to accept immediately
            setIsLoggedIn(true)
            await handleAccept()
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
            <Card className="max-w-md w-full p-8 text-center space-y-6 shadow-xl border-0 shadow-black/5">

                {/* Loading */}
                {status === 'loading' && (
                    <>
                        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
                        <h2 className="text-xl font-bold">Loading invite...</h2>
                    </>
                )}

                {/* Accepting */}
                {status === 'accepting' && (
                    <>
                        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
                        <h2 className="text-xl font-bold">Joining team...</h2>
                        <p className="text-muted-foreground">Adding you to {orgName}...</p>
                    </>
                )}

                {/* Show Invite (not logged in) */}
                {status === 'show_invite' && (
                    <>
                        {/* Invite Header */}
                        <div className="space-y-4">
                            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                                {orgLogo ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={orgLogo} alt={orgName} className="w-12 h-12 rounded-full object-cover" />
                                ) : (
                                    <Building2 className="h-8 w-8 text-primary" />
                                )}
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold">You&apos;re invited!</h2>
                                <p className="text-muted-foreground mt-1">
                                    Join <strong className="text-foreground">{orgName}</strong> as a{' '}
                                    <Badge variant="outline" className="capitalize font-semibold">
                                        {ROLE_LABELS[inviteRole] || inviteRole}
                                    </Badge>
                                </p>
                            </div>
                        </div>

                        {/* Choose: Login or Signup */}
                        {authMode === 'choose' && (
                            <div className="space-y-3 pt-2">
                                <p className="text-sm text-muted-foreground">
                                    Invite sent to <strong>{inviteEmail}</strong>
                                </p>
                                <Button className="w-full" size="lg" onClick={() => setAuthMode('login')}>
                                    I have an account — Log In
                                </Button>
                                <Button className="w-full" size="lg" variant="outline" onClick={() => setAuthMode('signup')}>
                                    I&apos;m new — Create Account
                                </Button>
                            </div>
                        )}

                        {/* Login Form */}
                        {authMode === 'login' && (
                            <div className="space-y-4 pt-2 text-left">
                                <div className="grid gap-2">
                                    <Label htmlFor="login-email">Email</Label>
                                    <Input
                                        id="login-email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@example.com"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="login-password">Password</Label>
                                    <div className="relative">
                                        <Input
                                            id="login-password"
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Enter your password"
                                            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                                {authError && (
                                    <p className="text-sm text-destructive">{authError}</p>
                                )}
                                <Button className="w-full" onClick={handleLogin} disabled={authLoading || !email || !password}>
                                    {authLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                    Log In & Join Team
                                </Button>
                                <button
                                    onClick={() => { setAuthMode('choose'); setAuthError('') }}
                                    className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
                                >
                                    ← Back
                                </button>
                            </div>
                        )}

                        {/* Signup Form */}
                        {authMode === 'signup' && (
                            <div className="space-y-4 pt-2 text-left">
                                <div className="grid gap-2">
                                    <Label htmlFor="signup-name">Full Name</Label>
                                    <Input
                                        id="signup-name"
                                        value={displayName}
                                        onChange={(e) => setDisplayName(e.target.value)}
                                        placeholder="John Doe"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="signup-email">Email</Label>
                                    <Input
                                        id="signup-email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@example.com"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="signup-password">Create Password</Label>
                                    <div className="relative">
                                        <Input
                                            id="signup-password"
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="At least 6 characters"
                                            onKeyDown={(e) => e.key === 'Enter' && handleSignup()}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                                {authError && (
                                    <p className="text-sm text-destructive">{authError}</p>
                                )}
                                <Button className="w-full" onClick={handleSignup} disabled={authLoading || !email || !password || !displayName}>
                                    {authLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                    Create Account & Join Team
                                </Button>
                                <button
                                    onClick={() => { setAuthMode('choose'); setAuthError('') }}
                                    className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
                                >
                                    ← Back
                                </button>
                            </div>
                        )}
                    </>
                )}

                {/* Success */}
                {status === 'success' && (
                    <>
                        <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                            <CheckCircle className="h-8 w-8 text-green-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-green-700">Welcome to {orgName}!</h2>
                        <p className="text-muted-foreground">
                            You&apos;ve joined as a <strong>{ROLE_LABELS[inviteRole] || inviteRole}</strong>. Redirecting to your dashboard...
                        </p>
                        <Button asChild className="w-full">
                            <Link href="/organizer">Go to Dashboard</Link>
                        </Button>
                    </>
                )}

                {/* Already a member */}
                {status === 'already_member' && (
                    <>
                        <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                            <CheckCircle className="h-8 w-8 text-blue-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-blue-700">Already a member!</h2>
                        <p className="text-muted-foreground">
                            You&apos;re already part of <strong>{orgName}</strong>.
                        </p>
                        <Button asChild className="w-full">
                            <Link href="/organizer">Go to Dashboard</Link>
                        </Button>
                    </>
                )}

                {/* Error */}
                {status === 'error' && (
                    <>
                        <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                            <XCircle className="h-8 w-8 text-red-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-red-700">Invite Error</h2>
                        <p className="text-muted-foreground">{errorMessage}</p>
                        <Button asChild variant="outline" className="w-full">
                            <Link href="/">Go Home</Link>
                        </Button>
                    </>
                )}

                {/* No token */}
                {status === 'no_token' && (
                    <>
                        <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center">
                            <AlertTriangle className="h-8 w-8 text-amber-600" />
                        </div>
                        <h2 className="text-2xl font-bold">Invalid Link</h2>
                        <p className="text-muted-foreground">
                            This invite link is missing a token. Please check the link and try again.
                        </p>
                        <Button asChild variant="outline" className="w-full">
                            <Link href="/">Go Home</Link>
                        </Button>
                    </>
                )}
            </Card>
        </div>
    )
}
