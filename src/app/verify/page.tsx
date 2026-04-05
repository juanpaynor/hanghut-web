'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { verifyOtpCode, sendOtpCode } from '@/lib/admin/otp-actions'
import { Mail, ShieldCheck, RefreshCw } from 'lucide-react'

export default function VerifyPage() {
    const [code, setCode] = useState(['', '', '', '', '', ''])
    const [loading, setLoading] = useState(false)
    const [resending, setResending] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [cooldown, setCooldown] = useState(0)
    const inputRefs = useRef<(HTMLInputElement | null)[]>([])
    const router = useRouter()

    const [pendingUserId, setPendingUserId] = useState<string | null>(null)
    const [maskedEmail, setMaskedEmail] = useState<string>('')

    useEffect(() => {
        const cookies = document.cookie.split(';').reduce((acc, c) => {
            const [key, val] = c.trim().split('=')
            acc[key] = val
            return acc
        }, {} as Record<string, string>)

        const userId = cookies['pending_2fa_user']
        const email = cookies['pending_2fa_email'] ? decodeURIComponent(cookies['pending_2fa_email']) : ''

        if (!userId) {
            router.push('/login')
            return
        }

        setPendingUserId(userId)
        setMaskedEmail(email)
    }, [router])

    useEffect(() => {
        if (cooldown <= 0) return
        const timer = setTimeout(() => setCooldown(c => c - 1), 1000)
        return () => clearTimeout(timer)
    }, [cooldown])

    useEffect(() => {
        inputRefs.current[0]?.focus()
    }, [pendingUserId])

    const handleChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return

        const newCode = [...code]
        newCode[index] = value.slice(-1)
        setCode(newCode)
        setError(null)

        if (value && index < 5) {
            inputRefs.current[index + 1]?.focus()
        }

        if (value && index === 5 && newCode.every(d => d)) {
            handleVerify(newCode.join(''))
        }
    }

    const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !code[index] && index > 0) {
            inputRefs.current[index - 1]?.focus()
        }
    }

    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault()
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
        if (pasted.length === 6) {
            const newCode = pasted.split('')
            setCode(newCode)
            inputRefs.current[5]?.focus()
            handleVerify(pasted)
        }
    }

    const handleVerify = async (codeStr?: string) => {
        if (!pendingUserId) return
        const fullCode = codeStr || code.join('')
        if (fullCode.length !== 6) {
            setError('Please enter all 6 digits')
            return
        }

        setLoading(true)
        setError(null)

        try {
            const result = await verifyOtpCode(pendingUserId, fullCode)

            if (!result.success) {
                setError(result.error || 'Invalid code')
                setCode(['', '', '', '', '', ''])
                inputRefs.current[0]?.focus()
                setLoading(false)
                return
            }

            setSuccess(true)

            document.cookie = 'pending_2fa_user=; path=/; max-age=0'
            document.cookie = 'pending_2fa_email=; path=/; max-age=0'

            setTimeout(() => {
                router.push('/admin')
                router.refresh()
            }, 500)
        } catch (err: any) {
            setError(err.message || 'Verification failed')
            setLoading(false)
        }
    }

    const handleResend = async () => {
        if (!pendingUserId || cooldown > 0) return
        setResending(true)
        setError(null)

        try {
            const result = await sendOtpCode(pendingUserId)
            setMaskedEmail(result.maskedEmail)
            setCooldown(60)
        } catch (err: any) {
            setError(err.message || 'Failed to resend code')
        } finally {
            setResending(false)
        }
    }

    if (!pendingUserId) return null

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
            <Card className="w-full max-w-md border-slate-700 bg-slate-800/50 backdrop-blur">
                <CardHeader className="space-y-1 text-center">
                    <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-indigo-600/20 flex items-center justify-center">
                        {success ? (
                            <ShieldCheck className="h-6 w-6 text-green-400" />
                        ) : (
                            <Mail className="h-6 w-6 text-indigo-400" />
                        )}
                    </div>
                    <CardTitle className="text-2xl font-bold text-white">
                        {success ? 'Verified!' : 'Check Your Email'}
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                        {success
                            ? 'Redirecting to dashboard...'
                            : `We sent a 6-digit code to ${maskedEmail || 'your email'}`
                        }
                    </CardDescription>
                </CardHeader>

                {!success && (
                    <CardContent className="space-y-6">
                        <div className="flex justify-center gap-2" onPaste={handlePaste}>
                            {code.map((digit, i) => (
                                <input
                                    key={i}
                                    ref={el => { inputRefs.current[i] = el }}
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={1}
                                    value={digit}
                                    onChange={e => handleChange(i, e.target.value)}
                                    onKeyDown={e => handleKeyDown(i, e)}
                                    disabled={loading}
                                    className="w-12 h-14 text-center text-2xl font-bold rounded-lg
                                        bg-slate-900/50 border-2 border-slate-600 text-white
                                        focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30
                                        transition-all outline-none disabled:opacity-50"
                                />
                            ))}
                        </div>

                        {error && (
                            <Alert variant="destructive" className="bg-red-950/50 border-red-900">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        <Button
                            onClick={() => handleVerify()}
                            disabled={loading || code.some(d => !d)}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            {loading ? 'Verifying...' : 'Verify Code'}
                        </Button>

                        <div className="text-center">
                            <button
                                onClick={handleResend}
                                disabled={resending || cooldown > 0}
                                className="text-sm text-slate-400 hover:text-indigo-400 transition-colors inline-flex items-center gap-1 disabled:opacity-50"
                            >
                                <RefreshCw className={`h-3 w-3 ${resending ? 'animate-spin' : ''}`} />
                                {cooldown > 0
                                    ? `Resend code in ${cooldown}s`
                                    : resending
                                        ? 'Sending...'
                                        : 'Resend code'
                                }
                            </button>
                        </div>
                    </CardContent>
                )}
            </Card>
        </div>
    )
}
