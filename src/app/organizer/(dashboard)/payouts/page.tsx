import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DollarSign, TrendingUp, Clock } from 'lucide-react'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

async function getPayoutStats(partnerId: string) {
    const supabase = await createClient()

    // Get all completed transactions
    const { data: transactions } = await supabase
        .from('transactions')
        .select('organizer_payout')
        .eq('partner_id', partnerId)
        .eq('status', 'completed')

    const totalEarnings = transactions?.reduce((sum, t) => sum + Number(t.organizer_payout), 0) || 0

    // Get all payouts
    const { data: payouts } = await supabase
        .from('payouts')
        .select('amount, status')
        .eq('partner_id', partnerId)

    const completedPayouts = payouts?.filter(p => p.status === 'completed')
        .reduce((sum, p) => sum + Number(p.amount), 0) || 0

    const pendingPayouts = payouts?.filter(p => p.status === 'pending_request')
        .reduce((sum, p) => sum + Number(p.amount), 0) || 0

    return {
        totalEarnings,
        completedPayouts,
        pendingPayouts,
        availableBalance: totalEarnings - completedPayouts - pendingPayouts,
    }
}

async function getPayoutHistory(partnerId: string) {
    const supabase = await createClient()

    const { data: payouts } = await supabase
        .from('payouts')
        .select('*')
        .eq('partner_id', partnerId)
        .order('created_at', { ascending: false })

    return payouts || []
}

export default async function OrganizerPayoutsPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: partner } = await supabase
        .from('partners')
        .select('*')
        .eq('user_id', user.id)
        .single()

    if (!partner) return null

    const stats = await getPayoutStats(partner.id)
    const payouts = await getPayoutHistory(partner.id)

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return 'bg-green-500/10 text-green-600'
            case 'pending_request': return 'bg-yellow-500/10 text-yellow-600'
            case 'approved': return 'bg-blue-500/10 text-blue-600'
            case 'processing': return 'bg-purple-500/10 text-purple-600'
            case 'rejected': return 'bg-red-500/10 text-red-600'
            default: return 'bg-slate-500/10 text-slate-600'
        }
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-4xl font-bold mb-2">Payouts</h1>
                <p className="text-muted-foreground">Manage your earnings and payout requests</p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-6 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground mb-1">Available Balance</p>
                            <p className="text-3xl font-bold text-green-600">
                                ₱{stats.availableBalance.toLocaleString()}
                            </p>
                        </div>
                        <DollarSign className="h-10 w-10 text-green-500 opacity-80" />
                    </div>
                </Card>

                <Card className="p-6 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground mb-1">Total Earnings</p>
                            <p className="text-3xl font-bold text-blue-600">
                                ₱{stats.totalEarnings.toLocaleString()}
                            </p>
                        </div>
                        <TrendingUp className="h-10 w-10 text-blue-500 opacity-80" />
                    </div>
                </Card>

                <Card className="p-6 bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/20">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground mb-1">Pending Requests</p>
                            <p className="text-3xl font-bold text-yellow-600">
                                ₱{stats.pendingPayouts.toLocaleString()}
                            </p>
                        </div>
                        <Clock className="h-10 w-10 text-yellow-500 opacity-80" />
                    </div>
                </Card>
            </div>

            {/* Request Payout Button */}
            {stats.availableBalance > 0 && (
                <Card className="p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-bold text-lg mb-1">Ready to cash out?</h3>
                            <p className="text-muted-foreground">
                                You have ₱{stats.availableBalance.toLocaleString()} available for payout
                            </p>
                        </div>
                        <Button size="lg" className="bg-primary">
                            Request Payout
                        </Button>
                    </div>
                </Card>
            )}

            {/* Payout History */}
            <Card className="p-6">
                <h2 className="text-2xl font-bold mb-6">Payout History</h2>
                {payouts.length === 0 ? (
                    <div className="text-center py-12">
                        <DollarSign className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                        <p className="text-muted-foreground">No payout requests yet</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {payouts.map((payout: any) => (
                            <div
                                key={payout.id}
                                className="flex items-center justify-between p-4 rounded-lg border border-border"
                            >
                                <div>
                                    <p className="font-semibold">₱{Number(payout.amount).toLocaleString()}</p>
                                    <p className="text-sm text-muted-foreground">
                                        {format(new Date(payout.requested_at), 'MMM d, yyyy')}
                                    </p>
                                </div>
                                <Badge className={getStatusColor(payout.status)}>
                                    {payout.status.replace('_', ' ').toUpperCase()}
                                </Badge>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    )
}
