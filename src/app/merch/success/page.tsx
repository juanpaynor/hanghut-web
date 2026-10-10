import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { CheckCircle2, PackageCheck, Mail, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Order Confirmed — HangHut Merch',
    description: 'Your merch order was placed successfully.',
}

/**
 * This page used to take no parameters at all. It told the buyer "we've emailed
 * a link to your order — that link is your claim code, so keep it", and then
 * offered one button, to /account, which a guest cannot open. So a guest who
 * bought merch was promised a link and handed a login wall.
 *
 * The claim page at /m/<claim_token> is fully public and already exists; the
 * order just never carried its id back here. create-merch-intent now appends
 * order_id to the Xendit return URL, and this page resolves the claim from it.
 */
export default async function MerchSuccessPage({
    searchParams,
}: {
    searchParams: Promise<{ order_id?: string }>
}) {
    const { order_id } = await searchParams

    let claimToken: string | null = null
    let quantity = 0
    let total = 0
    let eventTitle: string | null = null

    if (order_id) {
        // Admin client: buyers are usually guests with no session, and the order
        // UUID is itself the credential here. Display-safe fields only.
        const supabase = createAdminClient()
        const { data: order } = await supabase
            .from('merch_orders')
            .select('quantity, total_amount, status, event:events(title)')
            .eq('id', order_id)
            .maybeSingle()

        if (order) {
            quantity = order.quantity ?? 0
            total = Number(order.total_amount ?? 0)
            eventTitle = (order.event as any)?.title ?? null
        }

        // The claim row is written by the webhook, which can lose the race with
        // this redirect. A missing token means "not yet", never "not entitled",
        // so the page degrades to the email instruction instead of erroring.
        const { data: claim } = await supabase
            .from('merch_claims')
            .select('claim_token')
            .eq('merch_order_id', order_id)
            // limit(1) because maybeSingle() THROWS on more than one row, and a
            // throw here 500s the page a buyer sees immediately after paying.
            .limit(1)
            .maybeSingle()
        claimToken = claim?.claim_token ?? null
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <Card className="max-w-md w-full p-8 text-center space-y-5">
                <div className="mx-auto w-16 h-16 rounded-full bg-green-50 dark:bg-green-900/30 flex items-center justify-center">
                    <CheckCircle2 className="h-9 w-9 text-green-500" />
                </div>
                <div className="space-y-1.5">
                    <h1 className="text-2xl font-bold">Order confirmed 🎉</h1>
                    <p className="text-muted-foreground">
                        {eventTitle
                            ? <>Your merch for <span className="font-semibold text-foreground">{eventTitle}</span> is reserved.</>
                            : 'Thanks for your purchase! Your merch is on the way.'}
                    </p>
                </div>

                {quantity > 0 && (
                    <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-3 text-sm">
                        <span className="flex items-center gap-2 text-muted-foreground">
                            <Package className="h-4 w-4" />
                            {quantity} item{quantity === 1 ? '' : 's'}
                        </span>
                        <span className="font-semibold tabular-nums">₱{total.toLocaleString()}</span>
                    </div>
                )}

                <div className="text-left space-y-3 rounded-xl border p-4 text-sm">
                    <div className="flex items-start gap-2.5">
                        <Mail className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span>
                            {claimToken
                                ? <>We&apos;ve emailed your receipt and this same order link — keep either one.</>
                                : <>We&apos;ve emailed your receipt and a link to your order — that link is your claim code, so keep it.</>}
                        </span>
                    </div>
                    <div className="flex items-start gap-2.5">
                        <PackageCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span>
                            For claim-at-event items, show the QR on that page at the merch table.
                            If you have an account, it&apos;s also saved in <strong>My Tickets</strong>.
                        </span>
                    </div>
                </div>

                <div className="space-y-3">
                    {claimToken && (
                        <Button asChild className="w-full h-11 text-base shadow-sm">
                            <Link href={`/m/${claimToken}`} className="flex items-center gap-2">
                                <PackageCheck className="h-4 w-4" />
                                View my order
                            </Link>
                        </Button>
                    )}
                    <Button asChild variant={claimToken ? 'outline' : 'default'} className="w-full">
                        <Link href="/account">Go to My Tickets</Link>
                    </Button>
                </div>
            </Card>
        </div>
    )
}
