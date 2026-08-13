import { redirect } from 'next/navigation'
import { getAuthUser, getPartner } from '@/lib/auth/cached'
import { createClient } from '@/lib/supabase/server'
import { getMerchProducts, getMerchOrders, type MerchProduct, type MerchOrderRow } from '@/lib/organizer/merch-actions'
import { MerchManager } from '@/components/organizer/merch-manager'
import { MerchOrders } from '@/components/organizer/merch-orders'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export const dynamic = 'force-dynamic'

/**
 * Merch — organizer product catalog. Create products with priced, stock-tracked
 * variants (size/color), link them to an event or the storefront, and sell them
 * with claim-at-event or ship fulfillment.
 */
export default async function MerchPage() {
    const { user } = await getAuthUser()
    if (!user) redirect('/organizer/login')
    const partner = await getPartner(user.id)
    if (!partner) redirect('/organizer')
    // Feature-gated per partner (admin-enabled). Off → no merch tools.
    if (!(partner as any).merch_enabled) redirect('/organizer')

    const supabase = await createClient()
    const { data: events } = await supabase
        .from('events').select('id, title').eq('organizer_id', partner.id).order('created_at', { ascending: false })

    const [res, ordersRes] = await Promise.all([
        getMerchProducts(partner.id),
        getMerchOrders(partner.id),
    ])

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Merch</h1>
                <p className="text-muted-foreground mt-1">
                    Sell shirts, hats, and more alongside your tickets. Buyers claim at the event or get it shipped.
                </p>
            </div>

            <Tabs defaultValue="catalog">
                <TabsList>
                    <TabsTrigger value="catalog">Catalog</TabsTrigger>
                    <TabsTrigger value="orders">Orders</TabsTrigger>
                </TabsList>
                <TabsContent value="catalog" className="mt-6">
                    <MerchManager
                        organizerId={partner.id}
                        events={(events ?? []) as { id: string; title: string }[]}
                        initialProducts={('products' in res ? res.products : []) as MerchProduct[]}
                    />
                </TabsContent>
                <TabsContent value="orders" className="mt-6">
                    <MerchOrders initialOrders={('orders' in ordersRes ? ordersRes.orders : []) as MerchOrderRow[]} />
                </TabsContent>
            </Tabs>
        </div>
    )
}
