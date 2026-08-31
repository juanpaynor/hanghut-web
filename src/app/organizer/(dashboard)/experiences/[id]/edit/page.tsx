import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getPartner } from '@/lib/auth/cached'
import { redirect, notFound } from 'next/navigation'
import { ExperienceForm } from '@/components/organizer/experiences/experience-form'
import { PromoCodeManager } from '@/components/organizer/promo-code-manager'
import { getExperiencePromoCodes } from '@/lib/organizer/promo-actions'
import { ExperienceDangerZone } from '@/components/organizer/experiences/experience-danger-zone'
import { getExperienceDeletability } from '@/lib/organizer/experience-actions'

export default async function EditExperiencePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const { user } = await getAuthUser()
    if (!user) redirect('/organizer/login')

    const partner = await getPartner(user.id)
    if (!partner) redirect('/organizer/login')

    const supabase = await createClient()
    const { data: experience } = await supabase
        .from('tables')
        .select('id, title, description, experience_type, price_per_person, currency, max_guests, location_name, latitude, longitude, requirements, included_items, images, status')
        .eq('id', id)
        .eq('host_id', user.id)
        .eq('is_experience', true)
        .single()

    if (!experience) notFound()

    // Ownership is already proven by the host_id filter above, so this can be
    // fetched unguarded.
    const [{ data: promoCodes }, deletability] = await Promise.all([
        getExperiencePromoCodes(id),
        getExperienceDeletability(id),
    ])

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Edit Experience</h1>
                <p className="text-muted-foreground text-sm mt-0.5">{experience.title}</p>
            </div>
            <ExperienceForm partnerId={partner.id} experience={experience as any} />

            <div className="border-t pt-6">
                <h2 className="text-xl font-semibold mb-1">Promo codes</h2>
                <p className="text-muted-foreground text-sm mb-4">
                    Discounts guests can apply when booking this experience.
                </p>
                <PromoCodeManager experienceId={id} initialCodes={promoCodes} />
            </div>

            <div className="border-t pt-6">
                <ExperienceDangerZone
                    experienceId={id}
                    title={experience.title}
                    status={(experience as { status?: string }).status ?? 'open'}
                    canDelete={deletability.canDelete}
                    bookings={deletability.bookings}
                />
            </div>
        </div>
    )
}
