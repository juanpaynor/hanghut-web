import Link from 'next/link'
import { CheckCircle2, PackageCheck, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Order Confirmed — HangHut Merch',
    description: 'Your merch order was placed successfully.',
}

export default function MerchSuccessPage() {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <Card className="max-w-md w-full p-8 text-center space-y-5">
                <div className="mx-auto w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
                    <CheckCircle2 className="h-9 w-9 text-green-500" />
                </div>
                <div className="space-y-1.5">
                    <h1 className="text-2xl font-bold">Order confirmed 🎉</h1>
                    <p className="text-muted-foreground">Thanks for your purchase! Your merch is on the way.</p>
                </div>
                <div className="text-left space-y-3 rounded-xl border p-4 text-sm">
                    <div className="flex items-start gap-2.5">
                        <Mail className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span>We&apos;ve sent your receipt and pickup details to your email.</span>
                    </div>
                    <div className="flex items-start gap-2.5">
                        <PackageCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span>For claim-at-event items, show your claim QR (in <strong>My Tickets</strong>) at the merch table.</span>
                    </div>
                </div>
                <Button asChild className="w-full"><Link href="/account">Go to My Tickets</Link></Button>
            </Card>
        </div>
    )
}
