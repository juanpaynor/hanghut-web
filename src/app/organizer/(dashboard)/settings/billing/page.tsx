import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getPartner, getUserRole } from '@/lib/auth/cached'
import { BillingClient } from '@/components/organizer/billing-client'
import { Card } from '@/components/ui/card'
import { ShieldAlert } from 'lucide-react'

/**
 * HangHut Pro billing.
 *
 * OWNER ONLY, matching the edge function. Committing the business to a recurring
 * charge is not a delegated action, so a manager who can otherwise run the whole
 * account still cannot subscribe or cancel.
 */
export default async function BillingPage() {
    const { user } = await getAuthUser()
    if (!user) redirect('/organizer/login')

    const partner = await getPartner(user.id)
    if (!partner) redirect('/organizer/register')

    const supabase = await createClient()

    // TRUE ownership, not getUserRole(). getUserRole treats a platform-support
    // (ghost) seat as owner-equivalent, which is right for running an account but
    // wrong here: the edge function gates on partners.user_id = auth.uid() and
    // will 403 a ghost every time. Trusting the role here rendered Subscribe
    // buttons that could not possibly work, and the partner saw only "error".
    // A support account must not be able to commit someone's business to a
    // recurring charge, so the page is aligned to the function, not the reverse.
    const { data: ownedRow } = await supabase
        .from('partners')
        .select('id')
        .eq('id', partner.id)
        .eq('user_id', user.id)
        .maybeSingle()

    if (!ownedRow) {
        const role = await getUserRole(user.id)
        const isSupport = role?.role === 'owner'   // owner-equivalent but not the owner
        return (
            <div className="container mx-auto px-4 py-8 max-w-3xl">
                <h1 className="text-3xl font-bold mb-6">Billing</h1>
                <Card className="p-6 flex items-start gap-3">
                    <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold">Only the account owner can manage billing</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            {isSupport
                                ? 'You are signed in as a HangHut support account. Starting or changing a paid plan has to be done by the account owner themselves.'
                                : 'Ask whoever owns this HangHut account to make changes to the plan.'}
                        </p>
                    </div>
                </Card>
            </div>
        )
    }

    // Entitlement comes from the RPC, not the table. partner_entitlements has no
    // partner-facing read policy on purpose: the row carries granted_reason,
    // which holds internal commercial notes, and RLS cannot hide one column.
    // get_partner_entitlement() is SECURITY DEFINER and returns only the safe
    // fields.
    const [{ data: plan }, { data: subscription }, { data: resolved }] = await Promise.all([
        supabase.from('partner_plans')
            .select('code, name, price_monthly, price_annual, currency').eq('code', 'pro').maybeSingle(),
        supabase.from('partner_subscriptions')
            .select('*').eq('partner_id', partner.id)
            .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.rpc('get_partner_entitlement', { p_partner_id: partner.id }),
    ])

    const entitlement = resolved
        ? {
            plan_code: (resolved as any).plan,
            source: (resolved as any).source,
            current_period_end: (resolved as any).current_period_end,
        }
        : null

    const { data: cycles } = subscription
        ? await supabase.from('partner_subscription_cycles')
            .select('id, status, amount, currency, occurred_at, failure_code')
            .eq('subscription_id', subscription.id)
            .order('occurred_at', { ascending: false }).limit(12)
        : { data: [] }

    return (
        <div className="container mx-auto px-4 py-8 max-w-3xl">
            <h1 className="text-3xl font-bold mb-1">Billing</h1>
            <p className="text-muted-foreground mb-8">Your HangHut plan and payment history.</p>
            <BillingClient
                plan={plan as any}
                subscription={subscription as any}
                entitlement={entitlement as any}
                cycles={(cycles || []) as any}
            />
        </div>
    )
}
