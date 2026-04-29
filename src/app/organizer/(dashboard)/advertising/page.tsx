import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getAuthUser, getPartner } from '@/lib/auth/cached'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MousePointerClick, Receipt, TrendingUp, Info } from 'lucide-react'

export const dynamic = 'force-dynamic'

const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    paid:    'bg-green-100 text-green-800 border-green-200',
    waived:  'bg-blue-100 text-blue-800 border-blue-200',
    void:    'bg-gray-100 text-gray-500 border-gray-200',
}

export default async function AdvertisingPage() {
    const { user } = await getAuthUser()
    if (!user) redirect('/organizer/login')

    const partner = await getPartner(user.id)
    if (!partner) redirect('/organizer/login')

    const supabase = await createClient()

    // Current month (Manila time approximation via UTC+8)
    const now = new Date(Date.now() + 8 * 60 * 60 * 1000)
    const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`

    // Fetch this month's clicks with per-event breakdown
    const { data: thisMonthClicks } = await supabase
        .from('ad_clicks')
        .select('event_id, amount_usd, clicked_at, events(title)')
        .eq('partner_id', partner.id)
        .eq('invoice_month', currentMonth)

    // Fetch all invoices
    const { data: invoices } = await supabase
        .from('ad_invoices')
        .select('*')
        .eq('partner_id', partner.id)
        .order('invoice_month', { ascending: false })

    const thisMonthCount = thisMonthClicks?.length ?? 0
    const thisMonthUsd = thisMonthCount * 0.10

    // Per-event breakdown for this month
    const byEvent: Record<string, { title: string; clicks: number }> = {}
    for (const c of (thisMonthClicks ?? [])) {
        const eid = c.event_id as string
        const title = (c.events as any)?.title ?? 'Unknown Event'
        if (!byEvent[eid]) byEvent[eid] = { title, clicks: 0 }
        byEvent[eid].clicks++
    }
    const eventBreakdown = Object.values(byEvent).sort((a, b) => b.clicks - a.clicks)

    return (
        <div className="space-y-8 max-w-4xl">
            <div>
                <h1 className="text-2xl font-bold">Advertising</h1>
                <p className="text-muted-foreground mt-1 text-sm">
                    Track clicks on your external ticket links. You are billed <strong>$0.10 USD</strong> per unique click per user per month.
                </p>
            </div>

            {/* This month summary */}
            <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">{currentMonth} (Current Month)</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Card>
                        <CardHeader className="pb-1 pt-4 px-4">
                            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                <MousePointerClick className="h-3.5 w-3.5" /> Unique Clicks
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                            <p className="text-3xl font-bold">{thisMonthCount}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-1 pt-4 px-4">
                            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                <TrendingUp className="h-3.5 w-3.5" /> Estimated Bill
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                            <p className="text-3xl font-bold">${thisMonthUsd.toFixed(2)}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">USD · invoiced end of month</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-1 pt-4 px-4">
                            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                <Receipt className="h-3.5 w-3.5" /> External Events Active
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                            <p className="text-3xl font-bold">{Object.keys(byEvent).length}</p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Per-event breakdown */}
            {eventBreakdown.length > 0 && (
                <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Clicks by Event — {currentMonth}</h2>
                    <Card>
                        <CardContent className="p-0">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/30">
                                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Event</th>
                                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Clicks</th>
                                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount (USD)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {eventBreakdown.map((e, i) => (
                                        <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                                            <td className="px-4 py-3 font-medium">{e.title}</td>
                                            <td className="px-4 py-3 text-right">{e.clicks}</td>
                                            <td className="px-4 py-3 text-right font-semibold">${(e.clicks * 0.10).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>
                </div>
            )}

            {thisMonthCount === 0 && (
                <div className="flex items-start gap-3 bg-muted/40 border rounded-lg p-4 text-sm text-muted-foreground">
                    <Info className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>No clicks recorded this month yet. Clicks are tracked when logged-in users click "Get Tickets" on your external events.</span>
                </div>
            )}

            {/* Invoice history */}
            {(invoices?.length ?? 0) > 0 && (
                <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Invoice History</h2>
                    <Card>
                        <CardContent className="p-0">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/30">
                                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Month</th>
                                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Clicks</th>
                                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount (USD)</th>
                                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {invoices!.map((inv: any) => (
                                        <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/20">
                                            <td className="px-4 py-3 font-mono">{inv.invoice_month}</td>
                                            <td className="px-4 py-3 text-right">{inv.total_clicks}</td>
                                            <td className="px-4 py-3 text-right font-semibold">${Number(inv.total_usd).toFixed(2)}</td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLORS[inv.status]}`}>
                                                    {inv.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    )
}
