import { getAuthUser, getPartner } from '@/lib/auth/cached'
import { redirect } from 'next/navigation'
import { ExperienceForm } from '@/components/organizer/experiences/experience-form'

export default async function CreateExperiencePage() {
    const { user } = await getAuthUser()
    if (!user) redirect('/organizer/login')

    const partner = await getPartner(user.id)
    if (!partner) redirect('/organizer/login')

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">New Experience</h1>
                <p className="text-muted-foreground text-sm mt-0.5">Fill in the details for your hosted experience</p>
            </div>
            <ExperienceForm partnerId={partner.id} />
        </div>
    )
}
