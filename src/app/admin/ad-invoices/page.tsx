import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { AdInvoicesClient } from './ad-invoices-client'

export const dynamic = 'force-dynamic'

export default async function AdInvoicesPage({
    searchParams,
}: {
    searchParams: Promise<{ month?: string; status?: string }>
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')
    const { data: role } = await supabase.rpc('is_user_admin')
    if (!role) redirect('/login')

    const params = await searchParams
    // Default to current month
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const selectedMonth = params.month || currentMonth
    const selectedStatus = params.status || 'all'

    const admin = createAdminClient()

    // Fetch invoices with partner info
    let query = admin
        .from('ad_invoices')
        .select(`
            *,
            partner:partners(id, business_name, contact_email)
        `)
        .eq('invoice_month', selectedMonth)
        .order('total_usd', { ascending: false })

    if (selectedStatus !== 'all') {
        query = query.eq('status', selectedStatus)
    }

    const { data: invoices } = await query

    // Fetch un-invoiced click counts for this month (to show "generate" option)
    const { data: pendingClicks } = await admin
        .from('ad_clicks')
        .select('partner_id', { count: 'exact', head: true })
        .eq('invoice_month', selectedMonth)
        .eq('invoiced', false)
        .not('partner_id', 'is', null)

    // Get distinct months that have any clicks (for month picker)
    const { data: clickMonths } = await admin
        .from('ad_clicks')
        .select('invoice_month')
        .not('invoice_month', 'is', null)
        .order('invoice_month', { ascending: false })

    const months = [...new Set((clickMonths || []).map((r: any) => r.invoice_month as string))]
    if (!months.includes(currentMonth)) months.unshift(currentMonth)

    return (
        <AdInvoicesClient
            invoices={invoices || []}
            selectedMonth={selectedMonth}
            selectedStatus={selectedStatus}
            months={months}
            pendingClickCount={(pendingClicks as any)?.count ?? 0}
        />
    )
}
