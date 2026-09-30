'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Check, Loader2, CreditCard, AlertTriangle, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Plan { code: string; name: string; price_monthly: string; price_annual: string | null; currency: string }
interface Subscription {
    id: string; status: string; billing_interval: 'MONTH' | 'YEAR'
    amount: string; currency: string
    current_period_end: string | null; cancelled_at: string | null
    consecutive_failures: number; last_failure_code: string | null
    recovery_url: string | null; action_url: string | null
}
interface Entitlement { plan_code: string; source: string; current_period_end: string | null }
interface Cycle {
    id: string; status: string; amount: string | null; currency: string | null
    occurred_at: string; failure_code: string | null
}

const peso = (n: number | string) =>
    '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

const date = (s: string) =>
    new Date(s).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })

/** Only these are "you have a subscription". CANCELLED and INACTIVE are history. */
const LIVE = ['PENDING', 'REQUIRES_ACTION', 'ACTIVE']

export function BillingClient({ plan, subscription, entitlement, cycles }: {
    plan: Plan | null
    subscription: Subscription | null
    entitlement: Entitlement | null
    cycles: Cycle[]
}) {
    const router = useRouter()
    const params = useSearchParams()
    // The return leg creates a plan and takes a real charge, so it must run
    // exactly once. React re-invokes effects in development, and the logs showed
    // two activate calls 10ms apart.
    const activated = useRef(false)
    const { toast } = useToast()
    const [busy, setBusy] = useState<string | null>(null)
    const [confirmCancel, setConfirmCancel] = useState(false)

    const live = !!subscription && LIVE.includes(subscription.status)
    const isPaid = entitlement?.source === 'paid'
    const isGranted = entitlement?.source === 'granted'
    const failing = !!subscription && subscription.consecutive_failures > 0

    /**
     * Xendit sends the partner back here after the hosted card page. The token
     * only exists once they've finished, so the second leg has to run on return —
     * it cannot be done at the time we created the session.
     */
    const activate = async () => {
        setBusy('activate')
        // Deliberately sends no ids. The server resolves the partner's live
        // subscription and the session that captured its card. Requiring
        // sessionStorage here is what made a lost redirect unrecoverable: the
        // storage is per-origin and per-tab, and Xendit returns to APP_URL
        // whatever origin the partner started on.
        const { data, error } = await createClient().functions.invoke('create-partner-subscription', {
            body: { action: 'activate' },
        })
        sessionStorage.removeItem('hh_billing_session')
        sessionStorage.removeItem('hh_billing_sub')
        setBusy(null)

        if (error || (data as any)?.error) {
            toast({
                title: 'Could not finish setup',
                description: (data as any)?.error || 'Please try again.',
                variant: 'destructive',
            })
        } else if ((data as any)?.action_url) {
            window.location.href = (data as any).action_url
            return
        } else {
            toast({
                title: (data as any)?.mode === 'replace_card' ? 'Card updated' : 'Subscription started',
                description: 'A confirmation is on its way to your email.',
            })
        }
        router.replace('/organizer/settings/billing')
        router.refresh()
    }

    const sync = async (silent = false) => {
        if (!silent) setBusy('sync')
        const { data, error } = await createClient().functions.invoke('create-partner-subscription', {
            body: { action: 'sync' },
        })
        if (!silent) setBusy(null)
        const payload = data as any
        if (error || payload?.error) {
            if (!silent) {
                toast({
                    title: 'Could not check the subscription',
                    description: payload?.error || 'Please try again.',
                    variant: 'destructive',
                })
            }
            return
        }
        if (payload?.changed) {
            if (!silent) toast({ title: `Status updated to ${payload.status}` })
            router.refresh()
        } else if (!silent) {
            toast({ title: `Still ${payload?.status ?? 'unchanged'}`, description: 'Nothing has changed at the payment provider.' })
        }
    }

    /**
     * A PENDING row is a claim we have not verified. The webhook is the only
     * thing that normally moves a subscription off PENDING, so a missed event
     * leaves it stuck there forever — which is exactly what happened on the
     * first live signup. Reconcile against Xendit on load instead of waiting for
     * someone to notice. Bounded: only fires for PENDING, and not on the return
     * leg, where `activate` is about to write the status anyway.
     */
    useEffect(() => {
        if (subscription?.status !== 'PENDING') return
        if (params.get('status') === 'saved') return
        void sync(true)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subscription?.status])

    useEffect(() => {
        const status = params.get('status')
        if (status === 'cancelled') {
            toast({ title: 'Card setup cancelled', description: 'Nothing was charged.' })
            router.replace('/organizer/settings/billing')
            return
        }
        if (status !== 'saved') return
        if (activated.current) return
        activated.current = true
        void activate()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const start = async (interval: 'MONTH' | 'YEAR') => {
        setBusy(interval)
        const { data, error } = await createClient().functions.invoke('create-partner-subscription', {
            body: { action: 'start', billing_interval: interval },
        })
        setBusy(null)

        const payload = data as any
        if (error || payload?.error || !payload?.payment_link_url) {
            toast({
                title: 'Could not start',
                description: payload?.error || 'Please try again.',
                variant: 'destructive',
            })
            return
        }
        // Stashed because Xendit's return URL carries our own query string, not
        // these ids — and the second leg needs both.
        sessionStorage.setItem('hh_billing_sub', payload.subscription_id)
        sessionStorage.setItem('hh_billing_session', payload.payment_session_id)
        window.location.href = payload.payment_link_url
    }

    const cancel = async () => {
        setBusy('cancel')
        const { data, error } = await createClient().functions.invoke('create-partner-subscription', {
            body: { action: 'cancel' },
        })
        setBusy(null)
        setConfirmCancel(false)

        const payload = data as any
        if (error || payload?.error) {
            toast({ title: 'Could not cancel', description: payload?.error || 'Please try again.', variant: 'destructive' })
            return
        }
        toast({
            title: 'Subscription cancelled',
            description: payload?.access_until
                ? `You keep Pro until ${date(payload.access_until)}.`
                : 'Your access continues to the end of the period you paid for.',
        })
        router.refresh()
    }

    return (
        <div className="space-y-6">
            {/* ── Current state ─────────────────────────────────────────────── */}
            <Card className="p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <h2 className="text-xl font-bold">
                                {entitlement?.plan_code === 'pro' ? 'HangHut Pro' : 'Free'}
                            </h2>
                            {isGranted && <Badge variant="secondary">Complimentary</Badge>}
                            {isPaid && <Badge>Paid</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground max-w-md">
                            {isGranted
                                ? 'Pro is enabled on your account at no charge. Nothing to pay, nothing to set up.'
                                : isPaid && subscription
                                    ? `${subscription.billing_interval === 'YEAR' ? 'Billed yearly' : 'Billed monthly'} · ${peso(subscription.amount)}`
                                    : 'Upgrade to unlock seat maps, your own domain, API access and more.'}
                        </p>
                    </div>
                    {entitlement?.current_period_end && (
                        <div className="text-right">
                            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                                {subscription?.cancelled_at ? 'Access until' : 'Renews'}
                            </p>
                            <p className="font-semibold">{date(entitlement.current_period_end)}</p>
                        </div>
                    )}
                </div>

                {failing && (
                    <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-4 flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="font-semibold text-sm">We couldn&apos;t charge your card</p>
                            <p className="text-sm text-muted-foreground mt-0.5">
                                We&apos;ll keep trying for a few days. Your access isn&apos;t affected
                                {subscription?.current_period_end ? ` until ${date(subscription.current_period_end)}` : ''}.
                            </p>
                            <div className="flex gap-2 mt-3 flex-wrap">
                                {subscription?.recovery_url && (
                                    <Button size="sm" asChild>
                                        <a href={subscription.recovery_url} target="_blank" rel="noopener noreferrer">
                                            Pay now <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                                        </a>
                                    </Button>
                                )}
                                <Button size="sm" variant="outline" disabled={busy === 'MONTH'}
                                    onClick={() => start(subscription!.billing_interval)}>
                                    {busy === 'MONTH' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                                    Update card
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {subscription?.status === 'PENDING' && (
                    <div className="mt-5 rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-950/30 p-4">
                        <p className="font-semibold text-sm">Your subscription isn&apos;t finished</p>
                        <p className="text-sm text-muted-foreground mt-0.5 mb-3">
                            We saved your card but never started the plan, so nothing has been charged.
                            Finish now to activate Pro.
                        </p>
                        <div className="flex gap-2 flex-wrap">
                            <Button size="sm" disabled={busy === 'activate'} onClick={activate}>
                                {busy === 'activate' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                                Finish setup
                            </Button>
                            <Button size="sm" variant="outline"
                                disabled={busy === subscription.billing_interval}
                                onClick={() => start(subscription.billing_interval)}>
                                {busy === subscription.billing_interval && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                                Start over
                            </Button>
                            <Button size="sm" variant="ghost" disabled={busy === 'sync'}
                                onClick={() => sync(false)}>
                                {busy === 'sync' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                                Check status
                            </Button>
                        </div>
                    </div>
                )}

                {subscription?.status === 'REQUIRES_ACTION' && subscription.action_url && (
                    <div className="mt-5 rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-950/30 p-4">
                        <p className="font-semibold text-sm">One more step</p>
                        <p className="text-sm text-muted-foreground mt-0.5 mb-3">
                            Your bank needs to confirm this card before we can start the subscription.
                        </p>
                        <Button size="sm" asChild>
                            <a href={subscription.action_url}>Confirm with your bank</a>
                        </Button>
                    </div>
                )}
            </Card>

            {/* ── Choose a plan ─────────────────────────────────────────────── */}
            {!live && plan && (
                <Card className="p-6">
                    <h3 className="font-bold mb-1">
                        {isGranted ? 'Want to pay for Pro?' : 'Upgrade to Pro'}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-5">
                        {isGranted
                            ? 'Your account already has Pro for free — there is no need to subscribe. This is here if you would rather be on a normal paid plan.'
                            : 'Cancel any time. Cancelling keeps your access until the end of the period you have paid for.'}
                    </p>

                    <div className="grid gap-3 sm:grid-cols-2">
                        {(['MONTH', 'YEAR'] as const).map((interval) => {
                            const amount = interval === 'YEAR' ? plan.price_annual : plan.price_monthly
                            if (!amount || Number(amount) <= 0) return null
                            const monthlyEquivalent = Number(plan.price_monthly) * 12
                            const saving = interval === 'YEAR' && plan.price_annual
                                ? monthlyEquivalent - Number(plan.price_annual) : 0
                            return (
                                <button
                                    key={interval}
                                    type="button"
                                    onClick={() => start(interval)}
                                    disabled={!!busy}
                                    className={cn(
                                        'rounded-xl border p-5 text-left transition-colors',
                                        'hover:border-primary/50 disabled:opacity-60',
                                        interval === 'YEAR' && 'border-primary/40 bg-primary/5'
                                    )}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-semibold">
                                            {interval === 'YEAR' ? 'Yearly' : 'Monthly'}
                                        </span>
                                        {saving > 0 && (
                                            <Badge variant="secondary">Save {peso(saving)}</Badge>
                                        )}
                                    </div>
                                    <p className="text-2xl font-extrabold tabular-nums">
                                        {peso(amount)}
                                        <span className="text-sm font-medium text-muted-foreground">
                                            {interval === 'YEAR' ? '/year' : '/month'}
                                        </span>
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                                        {busy === interval
                                            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Opening secure page…</>
                                            : <><CreditCard className="h-3.5 w-3.5" /> Pay by card</>}
                                    </p>
                                </button>
                            )
                        })}
                    </div>
                    <p className="text-xs text-muted-foreground mt-4">
                        Card details are entered on Xendit&apos;s secure page — HangHut never sees or stores your card.
                    </p>
                </Card>
            )}

            {/* ── History ───────────────────────────────────────────────────── */}
            {cycles.length > 0 && (
                <Card className="p-6">
                    <h3 className="font-bold mb-4">Payment history</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-muted-foreground border-b">
                                    <th className="pb-2 font-medium">Date</th>
                                    <th className="pb-2 font-medium">Status</th>
                                    <th className="pb-2 font-medium text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {cycles.map((c) => (
                                    <tr key={c.id} className="border-b last:border-0">
                                        <td className="py-2.5">{date(c.occurred_at)}</td>
                                        <td className="py-2.5">
                                            {c.status === 'SUCCEEDED'
                                                ? <span className="inline-flex items-center gap-1 text-green-600">
                                                    <Check className="h-3.5 w-3.5" /> Paid
                                                  </span>
                                                : <span className="text-muted-foreground">
                                                    {c.failure_code || c.status}
                                                  </span>}
                                        </td>
                                        <td className="py-2.5 text-right tabular-nums">
                                            {c.amount ? peso(c.amount) : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {/* ── Cancel ────────────────────────────────────────────────────── */}
            {live && isPaid && !subscription?.cancelled_at && (
                <div>
                    <Button variant="ghost" size="sm" className="text-muted-foreground"
                        onClick={() => setConfirmCancel(true)}>
                        Cancel subscription
                    </Button>
                </div>
            )}

            <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Cancel HangHut Pro?</DialogTitle>
                        <DialogDescription>
                            You keep Pro until
                            {subscription?.current_period_end ? ` ${date(subscription.current_period_end)}` : ' the end of your paid period'}
                            . After that your account moves to the Free plan. You won&apos;t be charged again.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmCancel(false)}>Keep Pro</Button>
                        <Button variant="destructive" onClick={cancel} disabled={busy === 'cancel'}>
                            {busy === 'cancel' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Cancel subscription
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
