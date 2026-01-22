import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PartnerSettingsForm } from '@/components/organizer/partner-settings-form'

export default async function SettingsPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        redirect('/organizer/login')
    }

    const { data: partner } = await supabase
        .from('partners')
        .select('*') // Select all including new columns
        .eq('user_id', user.id)
        .single()

    console.log('[SettingsPage] Loaded partner:', partner ? { id: partner.id, slug: partner.slug, name: partner.business_name } : 'None')

    if (!partner) {
        redirect('/organizer/register')
    }

    // Pass data to client form
    return (
        <div className="container mx-auto px-4 py-8">
            <PartnerSettingsForm initialData={partner} />
        </div>
    )
}
