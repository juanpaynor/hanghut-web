'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

async function requireAdmin() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')
    const { data: role } = await supabase.rpc('is_user_admin')
    if (!role) throw new Error('Unauthorized')
    return user
}

/**
 * Generates invoices for a given month from un-invoiced ad_clicks.
 * Groups clicks by partner, creates/updates ad_invoices rows, marks clicks as invoiced.
 */
export async function generateInvoicesForMonth(month: string) {
    await requireAdmin()
    const admin = createAdminClient()

    // Aggregate un-invoiced clicks for this month grouped by partner
    const { data: groups, error } = await admin
        .from('ad_clicks')
        .select('partner_id, amount_usd')
        .eq('invoice_month', month)
        .eq('invoiced', false)
        .not('partner_id', 'is', null)

    if (error) return { error: error.message }
    if (!groups || groups.length === 0) return { error: 'No un-invoiced clicks found for this month.' }

    // Sum by partner
    const byPartner: Record<string, { clicks: number; usd: number }> = {}
    for (const row of groups) {
        const pid = row.partner_id as string
        if (!byPartner[pid]) byPartner[pid] = { clicks: 0, usd: 0 }
        byPartner[pid].clicks++
        byPartner[pid].usd += parseFloat(row.amount_usd as string)
    }

    // Upsert one invoice per partner per month
    const invoiceRows = Object.entries(byPartner).map(([partner_id, { clicks, usd }]) => ({
        partner_id,
        invoice_month: month,
        total_clicks: clicks,
        total_usd: Math.round(usd * 100) / 100,
        status: 'pending',
    }))

    const { error: upsertErr } = await admin
        .from('ad_invoices')
        .upsert(invoiceRows, { onConflict: 'partner_id,invoice_month' })

    if (upsertErr) return { error: upsertErr.message }

    // Mark clicks as invoiced
    const { error: markErr } = await admin
        .from('ad_clicks')
        .update({ invoiced: true, invoice_month: month })
        .eq('invoice_month', month)
        .eq('invoiced', false)
        .not('partner_id', 'is', null)

    if (markErr) return { error: markErr.message }

    revalidatePath('/admin/ad-invoices')
    return { success: true, count: invoiceRows.length }
}

export async function updateInvoiceStatus(
    invoiceId: string,
    status: 'pending' | 'paid' | 'waived' | 'void',
    notes?: string
) {
    const user = await requireAdmin()
    const admin = createAdminClient()

    const update: Record<string, any> = { status }
    if (notes !== undefined) update.notes = notes
    if (status === 'paid') {
        update.paid_at = new Date().toISOString()
        update.paid_by = user.email
    }

    const { error } = await admin
        .from('ad_invoices')
        .update(update)
        .eq('id', invoiceId)

    if (error) return { error: error.message }

    revalidatePath('/admin/ad-invoices')
    return { success: true }
}
