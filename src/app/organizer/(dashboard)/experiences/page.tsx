import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/cached'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Compass, CalendarClock, ExternalLink, Pencil } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ExperiencesPage() {
    const { user } = await getAuthUser()
    if (!user) redirect('/organizer/login')

    const supabase = await createClient()

    const { data: experiences } = await supabase
        .from('tables')
        .select(`
            id, title, description, experience_type, price_per_person,
            currency, location_name, images, is_experience, created_at,
            experience_schedules(id, start_time, status)
        `)
        .eq('host_id', user.id)
        .eq('is_experience', true)
        .order('created_at', { ascending: false })

    const list = experiences ?? []

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">My Experiences</h1>
                    <p className="text-muted-foreground text-sm mt-0.5">Manage your hosted experiences</p>
                </div>
                <Button asChild>
                    <Link href="/organizer/experiences/create">
                        <Plus className="h-4 w-4 mr-2" />
                        New Experience
                    </Link>
                </Button>
            </div>

            {list.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center space-y-4 border-2 border-dashed border-border rounded-2xl">
                    <Compass className="h-12 w-12 text-muted-foreground/30" />
                    <div>
                        <p className="font-semibold text-lg">No experiences yet</p>
                        <p className="text-muted-foreground text-sm">Create your first experience to get started.</p>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {list.map((exp: any) => {
                        const schedules = exp.experience_schedules ?? []
                        const upcomingSlots = schedules.filter(
                            (s: any) => s.status === 'open' && new Date(s.start_time) > new Date()
                        ).length
                        const heroImage = exp.images?.[0]

                        return (
                            <div key={exp.id} className="rounded-xl border border-border overflow-hidden hover:shadow-md transition-shadow">
                                <div className="relative h-36 bg-muted">
                                    {heroImage ? (
                                        <img src={heroImage} alt={exp.title} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Compass className="h-10 w-10 text-muted-foreground/30" />
                                        </div>
                                    )}
                                </div>
                                <div className="p-4 space-y-3">
                                    <div>
                                        <p className="font-semibold leading-tight">{exp.title}</p>
                                        {exp.location_name && (
                                            <p className="text-xs text-muted-foreground mt-0.5">{exp.location_name}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-bold text-primary">
                                            ₱{Number(exp.price_per_person).toLocaleString()}/person
                                        </span>
                                        <Badge variant="outline" className="text-xs capitalize">
                                            {exp.experience_type?.replace('_', ' ') ?? 'Experience'}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                            <CalendarClock className="h-3.5 w-3.5" />
                                            {upcomingSlots} upcoming slot{upcomingSlots !== 1 ? 's' : ''}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <Link
                                                href={`/organizer/experiences/${exp.id}/edit`}
                                                className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                                            >
                                                <Pencil className="h-3 w-3" /> Edit
                                            </Link>
                                            <Link
                                                href={`/experiences/${exp.id}`}
                                                target="_blank"
                                                className="flex items-center gap-1 text-primary hover:underline"
                                            >
                                                View <ExternalLink className="h-3 w-3" />
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
