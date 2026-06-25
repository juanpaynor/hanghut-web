'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { signInWithProvider, type OAuthProvider } from '@/lib/auth/oauth'

function GoogleIcon() {
    return (
        <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
        </svg>
    )
}

function AppleIcon() {
    return (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M16.37 1.43c0 1.14-.42 2.22-1.25 3.05-.9.94-2.03 1.49-3.05 1.4-.13-1.1.42-2.27 1.2-3.04.86-.86 2.3-1.47 3.1-1.41zM20.5 17.05c-.6 1.38-.88 1.99-1.65 3.21-1.07 1.7-2.58 3.82-4.46 3.83-1.66.02-2.09-1.08-4.35-1.07-2.26.01-2.73 1.09-4.4 1.08-1.87-.02-3.3-1.93-4.37-3.63C-1.16 15.5-1.47 9.07 1.36 5.7 2.65 4.13 4.5 3.15 6.34 3.15c1.87 0 3.05 1.08 4.6 1.08 1.5 0 2.41-1.08 4.58-1.08 1.64 0 3.37.89 4.61 2.43-4.05 2.22-3.39 8.01.37 11.47z" />
        </svg>
    )
}

/**
 * Google / Apple sign-in buttons. On click they redirect to the provider and
 * come back via /auth/callback → /organizer/post-login (the shared gate).
 */
// `showApple` is off by default until the Apple Services ID / return URL config
// is finished — flip it on once Sign in with Apple works.
export function OAuthButtons({ disabled, showApple = false }: { disabled?: boolean; showApple?: boolean }) {
    const [loading, setLoading] = useState<OAuthProvider | null>(null)

    const go = async (provider: OAuthProvider) => {
        setLoading(provider)
        try {
            await signInWithProvider(provider)
            // success → browser redirects to the provider; keep spinner up.
        } catch {
            setLoading(null)
        }
    }

    return (
        <div className="space-y-2">
            <Button
                type="button"
                variant="outline"
                className="w-full gap-2 font-medium"
                disabled={disabled || loading !== null}
                onClick={() => go('google')}
            >
                {loading === 'google' ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
                Continue with Google
            </Button>
            {showApple && (
                <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2 font-medium"
                    disabled={disabled || loading !== null}
                    onClick={() => go('apple')}
                >
                    {loading === 'apple' ? <Loader2 className="h-4 w-4 animate-spin" /> : <AppleIcon />}
                    Continue with Apple
                </Button>
            )}
        </div>
    )
}
