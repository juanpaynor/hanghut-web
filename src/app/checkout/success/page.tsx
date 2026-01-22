'use client'

import React, { Suspense } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CheckCircle2, Download, Home, Mail, Loader2 } from 'lucide-react'
import { useSearchParams } from 'next/navigation'

function SuccessContent() {
    const searchParams = useSearchParams()
    // In future we can read ?status= or ?id= from Xendit redirect
    // const status = searchParams.get('status') 

    return (
        <Card className="max-w-md w-full p-8 text-center space-y-6">
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto animate-in zoom-in duration-500">
                <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>

            <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Payment Successful!</h1>
                <p className="text-muted-foreground">
                    Your booking is confirmed.
                </p>
            </div>

            <div className="bg-muted/50 p-6 rounded-lg text-left border border-border/50">
                <div className="flex items-start gap-4 mb-4">
                    <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                        <Mail className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h3 className="font-semibold mb-1">Check your Email</h3>
                        <p className="text-sm text-muted-foreground">
                            We've sent your tickets and receipt to the email address you provided.
                        </p>
                    </div>
                </div>

                <h4 className="text-sm font-semibold mt-4 mb-2">What happens next?</h4>
                <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
                    <li>Open the email from HangHut.</li>
                    <li>Download your ticket QR code.</li>
                    <li>Show the QR code at the venue entrance.</li>
                </ul>
            </div>

            <div className="space-y-3 pt-2">
                <Button className="w-full h-11 text-base shadow-sm" asChild>
                    <Link href="/" className="flex items-center gap-2">
                        <Home className="h-4 w-4" />
                        Return to Home
                    </Link>
                </Button>
                <Button variant="outline" className="w-full text-muted-foreground" asChild>
                    <Link href="/contact">
                        Need Help? Contact Support
                    </Link>
                </Button>
            </div>
        </Card>
    )
}

export default function PurchaseSuccessPage() {
    return (
        <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
            <Suspense fallback={
                <Card className="p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></Card>
            }>
                <SuccessContent />
            </Suspense>
        </div>
    )
}
