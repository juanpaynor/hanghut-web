import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getPartner } from '@/lib/auth/cached'
import { redirect, notFound } from 'next/navigation'
import { ExperienceForm } from '@/components/organizer/experiences/experience-form'

export default async function EditExperiencePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const { user } = await getAuthUser()
    if (!user) redirect('/organizer/login')

    const partner = await getPartner(user.id)
    if (!partner) redirect('/organizer/login')

    const supabase = await createClient()
    const { data: experience } = await supabase
        .from('tables')
        .select('id, title, description, experience_type, price_per_person, currency, max_guests, location_name, latitude, longitude, requirements, included_items, images')
        .eq('id', id)
        .eq('host_id', user.id)
        .eq('is_experience', true)
        .single()

    if (!experience) notFound()

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Edit Experience</h1>
                <p className="text-muted-foreground text-sm mt-0.5">{experience.title}</p>
            </div>
            <ExperienceForm partnerId={partner.id} experience={experience as any} />
        </div>
    )
}
