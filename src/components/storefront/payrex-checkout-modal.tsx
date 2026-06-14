'use client'

import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

declare global {
    interface Window {
        Payrex: (publicKey: string) => any
    }
}

interface Props {
    open: boolean
    onClose: () => void
    clientSecret: string
    publicKey: string
    tierName: string
    priceMonthly: number
    partnerSlug: string
}

type Stage = 'loading' | 'ready' | 'submitting' | 'error'

export function PayrexCheckoutModal({ open, onClose, clientSecret, publicKey, tierName, priceMonthly, partnerSlug }: Props) {
    const [stage, setStage] = useState<Stage>('loading')
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const payrexRef = useRef<any>(null)
    const elementsRef = useRef<any>(null)
    const mountedRef = useRef(false)

    useEffect(() => {
        if (!open) {
            // Reset when closed
            setStage('loading')
            setErrorMsg(null)
            mountedRef.current = false
            payrexRef.current = null
            elementsRef.current = null
            return
        }

        if (!publicKey) {
            setErrorMsg('Payment not configured. Contact support.')
            setStage('error')
            return
        }

        function initPayrex() {
            if (mountedRef.current) return
            mountedRef.current = true

            try {
                payrexRef.current = window.Payrex(publicKey!)
                elementsRef.current = payrexRef.current.elements({ clientSecret })
                const paymentElement = elementsRef.current.create('payment')
                paymentElement.mount('#payrex-payment-element')
                paymentElement.on('ready', () => setStage('ready'))
            } catch (err: any) {
                setErrorMsg(err?.message || 'Failed to load payment form.')
                setStage('error')
            }
        }

        if (typeof window.Payrex === 'function') {
            initPayrex()
            return
        }

        const script = document.createElement('script')
        script.src = 'https://js.payrexhq.com'
        script.async = true
        script.onload = initPayrex
        script.onerror = () => {
            setErrorMsg('Failed to load payment library. Check your connection.')
            setStage('error')
        }
        document.head.appendChild(script)
    }, [open, clientSecret])

    const handleSubmit = async () => {
        if (!payrexRef.current || !elementsRef.current) return
        setStage('submitting')
        setErrorMsg(null)

        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
        const returnUrl = `${baseUrl}/subscriptions/success?partner=${partnerSlug}`

        try {
            const result = await payrexRef.current.attachPaymentMethod({
                elements: elementsRef.current,
                options: { return_url: returnUrl },
            })

            if (result?.error) {
                setErrorMsg(result.error.message || 'Payment failed. Please try again.')
                setStage('ready')
            }
            // On success Payrex redirects to return_url automatically
        } catch (err: any) {
            setErrorMsg(err?.message || 'Something went wrong. Please try again.')
            setStage('ready')
        }
    }

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Subscribe to {tierName}</DialogTitle>
                    <DialogDescription>
                        ₱{Number(priceMonthly).toLocaleString()}/month — cancel anytime
                    </DialogDescription>
                </DialogHeader>

                <div className="mt-2 flex flex-col gap-4">
                    {/* Scrollable payment form area */}
                    <div className="overflow-y-auto max-h-[60vh] pr-1">
                        {stage === 'loading' && (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        )}
                        {/* Payrex mounts here */}
                        <div id="payrex-payment-element" />
                    </div>

                    {stage === 'error' && (
                        <p className="text-sm text-destructive">{errorMsg}</p>
                    )}
                    {errorMsg && stage === 'ready' && (
                        <p className="text-sm text-destructive">{errorMsg}</p>
                    )}

                    <div className="flex gap-3 pt-1">
                        <Button variant="outline" className="flex-1" onClick={onClose} disabled={stage === 'submitting'}>
                            Cancel
                        </Button>
                        <Button
                            className="flex-1"
                            onClick={handleSubmit}
                            disabled={stage !== 'ready'}
                        >
                            {stage === 'submitting' ? (
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</>
                            ) : (
                                `Pay ₱${Number(priceMonthly).toLocaleString()}`
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
