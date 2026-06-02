import { getAuthUser, getPartnerId } from '@/lib/auth/cached'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users } from 'lucide-react'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

async function getSubscribers(partnerId: string) {
    const supabase = await createClient()
    const { data } = await supabase
        .from('fan_subscriptions')
        .select(`
            id, status, current_period_start, current_period_end, created_at, cancelled_at,
            subscription_tiers ( name, price_monthly ),
            users ( display_name, email )
        `)
        .eq('partner_id', partnerId)
        .order('created_at', { ascending: false })
    return data || []
}

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    active:       { label: 'Active',       variant: 'default' },
    grace_period: { label: 'Grace Period', variant: 'secondary' },
    cancelled:    { label: 'Cancelled',    variant: 'outline' },
    expired:      { label: 'Expired',      variant: 'destructive' },
}

export default async function SubscribersPage() {
    const { user } = await getAuthUser()
    if (!user) redirect('/organizer/login')

    const partnerId = await getPartnerId(user.id)
    if (!partnerId) redirect('/organizer')

    const subscribers = await getSubscribers(partnerId)
    const active = subscribers.filter(s => s.status === 'active' || s.status === 'grace_period')
    const mrr = active.reduce((sum, s) => sum + Number((s.subscription_tiers as any)?.price_monthly || 0), 0)

    return (
        <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: 'Active Subscribers', value: active.length },
                    { label: 'Monthly Recurring Revenue', value: `₱${mrr.toLocaleString()}` },
                    { label: 'Total All-Time', value: subscribers.length },
                ].map(stat => (
                    <Card key={stat.label} className="p-5">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{stat.label}</p>
                        <p className="text-2xl font-bold">{stat.value}</p>
                    </Card>
                ))}
            </div>

            {/* Table */}
            <Card>
                {subscribers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                        <Users className="h-10 w-10 mb-3 opacity-40" />
                        <p className="font-semibold text-foreground">No subscribers yet</p>
                        <p className="text-sm mt-1">Share your storefront to start growing your membership</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border text-left">
                                    {['Fan', 'Tier', 'Status', 'Subscribed', 'Next Renewal'].map(h => (
                                        <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {subscribers.map(sub => {
                                    const fan = sub.users as any
                                    const tier = sub.subscription_tiers as any
                                    const badge = STATUS_BADGE[sub.status] || { label: sub.status, variant: 'outline' as const }
                                    const isCancelled = sub.status === 'cancelled' || sub.status === 'expired'

                                    return (
                                        <tr key={sub.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                                            <td className="px-4 py-3">
                                                <p className="font-medium">{fan?.display_name || '—'}</p>
                                                <p className="text-xs text-muted-foreground">{fan?.email}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="font-medium">{tier?.name}</span>
                                                <span className="text-muted-foreground ml-1.5">₱{Number(tier?.price_monthly).toLocaleString()}/mo</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge variant={badge.variant}>{badge.label}</Badge>
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground">
                                                {format(new Date(sub.created_at), 'MMM d, yyyy')}
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground">
                                                {isCancelled
                                                    ? <span className="text-xs">Access until {format(new Date(sub.current_period_end), 'MMM d')}</span>
                                                    : format(new Date(sub.current_period_end), 'MMM d, yyyy')
                                                }
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    )
}
