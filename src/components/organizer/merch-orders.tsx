'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PackageCheck, Truck, CheckCircle2, Loader2, ShoppingBag } from 'lucide-react'
import { markMerchShipped, type MerchOrderRow } from '@/lib/organizer/merch-actions'
import { format } from 'date-fns'

const peso = (n: number) => `₱${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

export function MerchOrders({ initialOrders }: { initialOrders: MerchOrderRow[] }) {
    const [orders, setOrders] = useState(initialOrders)
    const [busy, setBusy] = useState<string | null>(null)

    const revenue = orders.reduce((s, o) => s + Number(o.subtotal), 0)
    const unshipped = orders.filter(o => o.fulfillment_mode === 'ship' && o.claim?.status === 'unclaimed').length

    async function ship(orderId: string) {
        setBusy(orderId)
        const res = await markMerchShipped(orderId)
        setBusy(null)
        if ('success' in res && res.success) {
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, claim: o.claim ? { ...o.claim, status: 'shipped' } : o.claim } : o))
        } else if ('error' in res) {
            alert(res.error)
        }
    }

    if (orders.length === 0) {
        return (
            <Card className="p-10 text-center">
                <ShoppingBag className="h-10 w-10 mx-auto text-muted-foreground/40" />
                <p className="mt-3 font-medium">No merch orders yet</p>
                <p className="text-sm text-muted-foreground">Paid orders will show up here.</p>
            </Card>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex gap-3">
                <Card className="p-4 flex-1"><div className="text-xs text-muted-foreground">Orders</div><div className="text-xl font-bold">{orders.length}</div></Card>
                <Card className="p-4 flex-1"><div className="text-xs text-muted-foreground">Merch revenue</div><div className="text-xl font-bold">{peso(revenue)}</div></Card>
                <Card className="p-4 flex-1"><div className="text-xs text-muted-foreground">To ship</div><div className="text-xl font-bold">{unshipped}</div></Card>
            </div>

            <div className="space-y-2">
                {orders.map(o => {
                    const isShip = o.fulfillment_mode === 'ship'
                    const status = o.claim?.status ?? 'unclaimed'
                    return (
                        <Card key={o.id} className="p-4">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold truncate">{o.guest_name || o.guest_email || 'Buyer'}</span>
                                        <Badge variant="outline" className="text-[10px] h-5 gap-1">
                                            {isShip ? <Truck className="h-3 w-3" /> : <PackageCheck className="h-3 w-3" />}
                                            {isShip ? 'Ship' : 'Pickup'}
                                        </Badge>
                                        {status === 'claimed' && <Badge variant="secondary" className="text-[10px] h-5 gap-1"><CheckCircle2 className="h-3 w-3" /> Collected</Badge>}
                                        {status === 'shipped' && <Badge variant="secondary" className="text-[10px] h-5 gap-1"><Truck className="h-3 w-3" /> Shipped</Badge>}
                                    </div>
                                    <ul className="mt-1 text-sm text-muted-foreground">
                                        {o.items.map((it, i) => <li key={i}>{it.quantity}× {it.name_snapshot}</li>)}
                                    </ul>
                                    <div className="text-xs text-muted-foreground mt-1">{format(new Date(o.created_at), 'MMM d, h:mm a')} · {o.payment_method || '—'}</div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="font-bold">{peso(o.subtotal)}</div>
                                    {isShip && status === 'unclaimed' && (
                                        <Button size="sm" variant="outline" className="mt-2" disabled={busy === o.id} onClick={() => ship(o.id)}>
                                            {busy === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Mark shipped'}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}
