'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requestPayout, sendPayoutOtp } from '@/lib/organizer/payout-actions'
import { PAYOUT_OTP_THRESHOLD, DISBURSEMENT_FEE_PHP, DISBURSEMENT_FEE_TOTAL, DISBURSEMENT_VAT_AMOUNT } from '@/lib/organizer/payout-constants'
import { useToast } from '@/hooks/use-toast'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, Building2, ShieldCheck, ArrowLeft, Lock } from 'lucide-react'

interface RequestPayoutCardProps {
    balance: number
    partnerId: string
    hasBank: boolean
    useMainWallet?: boolean
}

export function RequestPayoutCard({ balance, partnerId, hasBank, useMainWallet = false }: RequestPayoutCardProps) {
    const { toast } = useToast()
    const [amount, setAmount] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    // OTP step state
    const [step, setStep] = useState<'amount' | 'otp'>('amount')
    const [code, setCode] = useState('')
    const [maskedEmail, setMaskedEmail] = useState('')
    const [managedOpen, setManagedOpen] = useState(false)

    // Xendit charges a flat ₱11.20 (₱10 + 12% VAT) transfer fee per payout, on top of
    // the requested amount, debited from the wallet — so the max requestable is the
    // wallet balance minus that fee.
    const feeTotal = DISBURSEMENT_FEE_TOTAL
    const maxRequestable = Math.max(0, Math.floor(balance - feeTotal))
    const amountNum = Number(amount) || 0
    const totalDebit = amountNum > 0 ? amountNum + feeTotal : 0

    function validAmount(): number | null {
        const val = parseInt(amount)
        if (isNaN(val) || val <= 0) {
            toast({ title: 'Invalid Amount', description: 'Please enter a valid amount.', variant: 'destructive' })
            return null
        }
        if (val > maxRequestable) {
            toast({ title: 'Insufficient Balance', description: `You can withdraw up to ₱${maxRequestable.toLocaleString()} (a ₱${feeTotal.toLocaleString()} transfer fee is added on top, debited from your ₱${balance.toLocaleString()} balance).`, variant: 'destructive' })
            return null
        }
        return val
    }

    // Step 1 → small payouts submit directly; large ones email a code first.
    async function handleContinue() {
        const val = validAmount()
        if (val === null) return

        if (val <= PAYOUT_OTP_THRESHOLD) {
            // Below threshold — no OTP required, submit directly.
            setIsLoading(true)
            try {
                const res = await requestPayout(partnerId, val, '')
                if (res.success) {
                    toast({ title: 'Success', description: res.message })
                    setAmount('')
                } else {
                    toast({ title: 'Error', description: res.message, variant: 'destructive' })
                }
            } catch {
                toast({ title: 'Request Failed', description: 'Something went wrong.', variant: 'destructive' })
            } finally {
                setIsLoading(false)
            }
            return
        }

        // Above threshold — email a verification code bound to this amount.
        setIsLoading(true)
        try {
            const res = await sendPayoutOtp(val)
            if (res.success) {
                setMaskedEmail(res.maskedEmail || '')
                setStep('otp')
                setCode('')
                toast({ title: 'Code sent', description: `We emailed a 6-digit code to ${res.maskedEmail}.` })
            } else {
                toast({ title: 'Error', description: res.message, variant: 'destructive' })
            }
        } catch {
            toast({ title: 'Request Failed', description: 'Something went wrong.', variant: 'destructive' })
        } finally {
            setIsLoading(false)
        }
    }

    async function handleResend() {
        const val = validAmount()
        if (val === null) return
        setIsLoading(true)
        try {
            const res = await sendPayoutOtp(val)
            if (res.success) {
                setMaskedEmail(res.maskedEmail || '')
                toast({ title: 'Code resent', description: `We emailed a new code to ${res.maskedEmail}.` })
            } else {
                toast({ title: 'Error', description: res.message, variant: 'destructive' })
            }
        } finally {
            setIsLoading(false)
        }
    }

    // Step 2 → confirm the payout with the emailed code.
    async function handleConfirm() {
        const val = validAmount()
        if (val === null) return
        if (code.trim().length !== 6) {
            toast({ title: 'Enter the code', description: 'Enter the 6-digit code from your email.', variant: 'destructive' })
            return
        }
        setIsLoading(true)
        try {
            const res = await requestPayout(partnerId, val, code.trim())
            if (res.success) {
                toast({ title: 'Success', description: res.message })
                setAmount('')
                setCode('')
                setStep('amount')
            } else {
                toast({ title: 'Error', description: res.message, variant: 'destructive' })
            }
        } catch {
            toast({ title: 'Request Failed', description: 'Something went wrong.', variant: 'destructive' })
        } finally {
            setIsLoading(false)
        }
    }

    // A managed account cannot withdraw on its own: the money sits in the HangHut
    // platform wallet, not a sub-wallet of their own, and releasing it is a manual
    // step on our side. Showing the amount field and letting the request fail at the
    // edge function produced a bare red "Payouts are temporarily unavailable" toast,
    // which reads as a fault rather than as how the account is configured.
    //
    // This branch comes BEFORE the no-bank and zero-balance branches on purpose.
    // Telling a managed partner to "set up a bank account" sends them to fix
    // something that would not unblock them.
    if (useMainWallet) {
        return (
            <>
                <Card className="border-primary/30 bg-primary/5">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Lock className="h-4 w-4 shrink-0 text-primary" />
                            <CardTitle>Payouts are released by HangHut</CardTitle>
                        </div>
                        <CardDescription>
                            Your account is set to <span className="font-medium text-foreground">managed platform</span>,
                            so withdrawals are handled by our team rather than requested here.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-lg border bg-background p-3">
                            <div className="text-xs text-muted-foreground">Your balance</div>
                            <div className="text-2xl font-bold tabular-nums">
                                ₱{balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Held in the HangHut platform account. Still yours — it is not withdrawable from this page.
                            </p>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button variant="outline" className="w-full" onClick={() => setManagedOpen(true)}>
                            What does this mean?
                        </Button>
                    </CardFooter>
                </Card>

                <Dialog open={managedOpen} onOpenChange={setManagedOpen}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <div className="flex items-center gap-2">
                                <Building2 className="h-5 w-5 shrink-0 text-primary" />
                                <DialogTitle>Your account is managed by HangHut</DialogTitle>
                            </div>
                            <DialogDescription asChild>
                                <div className="space-y-3 pt-2 text-left">
                                    <p>
                                        Most organisers have their own payment wallet and can withdraw whenever
                                        they like. Your account is set up differently: your sales settle into the
                                        HangHut platform account, so there is no separate wallet for this page to
                                        withdraw from.
                                    </p>
                                    <p>
                                        <span className="font-medium text-foreground">
                                            ₱{balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </span>{' '}
                                        is recorded as yours. Nothing has gone missing and nothing has failed — this
                                        is how your account is configured.
                                    </p>
                                    <p>
                                        To receive it, get in touch with the HangHut team and we will release the
                                        funds to your bank account for you.
                                    </p>
                                </div>
                            </DialogDescription>
                        </DialogHeader>
                    </DialogContent>
                </Dialog>
            </>
        )
    }

    if (!hasBank) {
        return (
            <Card className="border-yellow-500/50 bg-yellow-500/5">
                <CardHeader>
                    <CardTitle className="text-yellow-700">Setup Bank Account</CardTitle>
                    <CardDescription className="text-yellow-600">
                        You need to add a bank account before you can request payouts.
                        Go to the "Settings" tab to add one.
                    </CardDescription>
                </CardHeader>
            </Card>
        )
    }

    if (balance <= 0) {
        return (
            <Card className="opacity-75">
                <CardHeader>
                    <CardTitle>Payout Request</CardTitle>
                    <CardDescription>You need a positive balance to request a payout.</CardDescription>
                </CardHeader>
            </Card>
        )
    }

    if (step === 'otp') {
        return (
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                        <CardTitle>Verify it&apos;s you</CardTitle>
                    </div>
                    <CardDescription>
                        Enter the 6-digit code we emailed to <span className="font-medium">{maskedEmail}</span> to confirm your
                        payout of <span className="font-semibold">₱{Number(amount).toLocaleString()}</span>.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="otp">Verification code</Label>
                        <Input
                            id="otp"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            placeholder="000000"
                            className="text-center text-2xl font-bold tracking-[0.4em]"
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            autoFocus
                        />
                        <button
                            type="button"
                            onClick={handleResend}
                            disabled={isLoading}
                            className="text-xs text-primary hover:underline disabled:opacity-50"
                        >
                            Didn&apos;t get it? Resend code
                        </button>
                    </div>
                </CardContent>
                <CardFooter className="flex-col gap-2">
                    <Button className="w-full" onClick={handleConfirm} disabled={isLoading || code.length !== 6}>
                        {isLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Confirming...</>) : 'Confirm Payout'}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => { setStep('amount'); setCode('') }}
                        disabled={isLoading}
                    >
                        <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
                    </Button>
                </CardFooter>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Request Payout</CardTitle>
                <CardDescription>
                    Enter amount to withdraw.
                    <br />
                    <span className="text-xs text-muted-foreground">
                        A ₱{DISBURSEMENT_FEE_TOTAL.toLocaleString()} transfer fee (₱{DISBURSEMENT_FEE_PHP} + 12% VAT) is charged by Xendit per payout, on top of your amount. Payouts over ₱{PAYOUT_OTP_THRESHOLD.toLocaleString()} require email verification.
                    </span>
                    {useMainWallet && (
                        <>
                            <br />
                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Building2 className="h-3 w-3 shrink-0" />
                                Your balance is held in the HangHut platform account and is calculated
                                from completed sales minus previous payouts.
                            </span>
                        </>
                    )}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="amount">Amount (PHP)</Label>
                    <div className="relative">
                        <span className="absolute left-3 top-2.5 text-muted-foreground">₱</span>
                        <Input
                            id="amount"
                            type="number"
                            placeholder="0.00"
                            className={`pl-8 text-lg font-bold ${Number(amount) > maxRequestable ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                            value={amount}
                            onChange={(e) => {
                                const val = e.target.value
                                // Allow empty or valid numbers, clamp to max (balance minus transfer fee)
                                if (val === '' || Number(val) <= maxRequestable) {
                                    setAmount(val)
                                } else {
                                    setAmount(maxRequestable.toString())
                                }
                            }}
                            min={0}
                            max={maxRequestable}
                        />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Available: ₱{balance.toLocaleString()}</span>
                        <button
                            type="button"
                            onClick={() => setAmount(maxRequestable.toString())}
                            className="text-primary hover:underline"
                        >
                            Max (₱{maxRequestable.toLocaleString()})
                        </button>
                    </div>

                    {/* Fee breakdown — what actually leaves the wallet */}
                    {amountNum > 0 && (
                        <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm">
                            <div className="flex justify-between text-muted-foreground">
                                <span>You receive</span>
                                <span className="font-medium text-foreground">₱{amountNum.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                                <span>Transfer fee (₱{DISBURSEMENT_FEE_PHP} + ₱{DISBURSEMENT_VAT_AMOUNT.toLocaleString()} VAT)</span>
                                <span>+₱{feeTotal.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between border-t pt-1.5 font-semibold">
                                <span>Total debited from wallet</span>
                                <span>₱{totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
            <CardFooter>
                <Button
                    className="w-full"
                    onClick={handleContinue}
                    disabled={isLoading || !amount || Number(amount) <= 0 || Number(amount) > maxRequestable}
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {Number(amount) > PAYOUT_OTP_THRESHOLD ? 'Sending code...' : 'Processing...'}
                        </>
                    ) : (
                        Number(amount) > PAYOUT_OTP_THRESHOLD ? 'Continue' : 'Submit Request'
                    )}
                </Button>
            </CardFooter>
        </Card>
    )
}
