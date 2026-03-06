import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ShieldCheck, Users, Clock, AlertTriangle, CheckCircle, ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import { ExperienceHeroCarousel } from '@/components/experiences/experience-hero-carousel'
import { ExperienceHostSection } from '@/components/experiences/experience-host-section'
import { ExperienceSlotPicker } from '@/components/experiences/experience-slot-picker'

export const dynamic = 'force-dynamic'

async function getExperience(id: string) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('tables')
        .select(`
            id,
            title,
            description,
            location_name,
            latitude,
            longitude,
            experience_type,
            images,
            video_url,
            price_per_person,
            currency,
            host_id,
            host_bio,
            host_avatar_url,
            verified_by_hanghut,
            included_items,
            requirements,
            is_experience,
            created_at,
            experience_schedules(*)
        `)
        .eq('id', id)
        .eq('is_experience', true)
        .single()

    if (error || !data) return null
    return data
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params
    const exp = await getExperience(id)
    if (!exp) return { title: 'Experience Not Found' }

    const heroImage = exp.images?.[0]
    return {
        title: `${exp.title} — HangHut Experiences`,
        description: exp.description || `Book ${exp.title} on HangHut`,
        openGraph: {
            title: exp.title,
            description: exp.description ?? undefined,
            images: heroImage ? [heroImage] : [],
        },
    }
}

const EXPERIENCE_TYPE_LABELS: Record<string, string> = {
    workshop: 'Workshop',
    adventure: 'Adventure',
    food_tour: 'Food Tour',
    nightlife: 'Nightlife',
    culture: 'Culture',
    other: 'Experience',
}

export default async function ExperienceDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const supabase = await createClient()
    const exp = await getExperience(id)

    if (!exp) notFound()

    // Fetch host display name from public.users (host_id mirrors auth.users.id)
    const { data: hostUser } = await supabase
        .from('users')
        .select('display_name, avatar_url')
        .eq('id', exp.host_id)
        .single()

    const { data: { user } } = await supabase.auth.getUser()
    const isLoggedIn = !!user

    const images: string[] = (exp.images as string[]) ?? []
    const schedules = exp.experience_schedules ?? []
    const hostName: string = hostUser?.display_name ?? 'Your Host'
    const hostAvatarUrl: string | null = exp.host_avatar_url ?? hostUser?.avatar_url ?? null
    const typeLabel = EXPERIENCE_TYPE_LABELS[exp.experience_type ?? ''] ?? 'Experience'
    const successUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/experiences/success`
    const failureUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/experiences/${id}`
    const symbol = exp.currency === 'PHP' ? '₱' : (exp.currency ?? '₱')

    // Quick stats
    const maxGuests = (schedules as any[]).reduce((max: number, s: any) => Math.max(max, s.max_guests ?? 0), 0)
    const minDurationMs = (schedules as any[]).reduce((min: number, s: any) => {
        if (!s.start_time || !s.end_time) return min
        const dur = new Date(s.end_time).getTime() - new Date(s.start_time).getTime()
        return min === 0 ? dur : Math.min(min, dur)
    }, 0)
    const durationHours = minDurationMs > 0 ? Math.round(minDurationMs / 1000 / 60 / 60 * 10) / 10 : null

    return (
        <div className="min-h-screen bg-background pb-24">
            {/* Navbar */}
            <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur">
                <div className="container mx-auto px-4 flex h-14 items-center gap-3">
                    <Link href="/" className="flex items-center gap-2 font-bold text-xl hover:opacity-80 transition-opacity">
                        <div className="bg-primary px-3 py-1 rounded-md text-primary-foreground transform -rotate-2 text-base">
                            HANGHUT
                        </div>
                    </Link>
                    <span className="text-muted-foreground text-sm hidden sm:block">/ Experiences</span>
                </div>
            </header>

            <main className="container mx-auto px-4 pt-8 max-w-6xl">
                <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
                >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to Explore
                </Link>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                    {/* ── LEFT COLUMN ── */}
                    <div className="lg:col-span-2 space-y-8">

                        <ExperienceHeroCarousel
                            images={images}
                            videoUrl={exp.video_url}
                            title={exp.title}
                        />

                        {/* Type + Verified Badges */}
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="uppercase tracking-widest text-[10px] font-bold px-3 py-1">
                                {typeLabel}
                            </Badge>
                            {exp.verified_by_hanghut && (
                                <Badge className="gap-1.5 bg-blue-500/10 text-blue-600 border-blue-200 hover:bg-blue-500/20">
                                    <ShieldCheck className="h-3 w-3" />
                                    Verified by HangHut
                                </Badge>
                            )}
                        </div>

                        {/* Title + Price */}
                        <div>
                            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight leading-tight">
                                {exp.title}
                            </h1>
                            <p className="text-muted-foreground mt-1 text-sm">{exp.location_name}</p>
                            <div className="flex items-center gap-4 mt-3 flex-wrap">
                                <span className="text-2xl font-bold text-primary">
                                    {symbol}{Number(exp.price_per_person).toLocaleString()}
                                    <span className="text-sm font-normal text-muted-foreground ml-1">/ person</span>
                                </span>
                            </div>
                        </div>

                        {/* Host Section */}
                        <ExperienceHostSection
                            hostName={hostName}
                            hostBio={exp.host_bio}
                            hostAvatarUrl={hostAvatarUrl}
                            verifiedByHanghut={exp.verified_by_hanghut ?? false}
                        />

                        {/* Description */}
                        {exp.description && (
                            <div className="space-y-3">
                                <h2 className="text-xl font-bold">What we'll do</h2>
                                <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                                    {exp.description}
                                </p>
                            </div>
                        )}

                        {/* Quick Stats */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            {durationHours && (
                                <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/30 border border-border/50">
                                    <Clock className="h-5 w-5 text-primary shrink-0" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Duration</p>
                                        <p className="font-semibold text-sm">{durationHours} hr{durationHours !== 1 ? 's' : ''}</p>
                                    </div>
                                </div>
                            )}
                            {maxGuests > 0 && (
                                <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/30 border border-border/50">
                                    <Users className="h-5 w-5 text-primary shrink-0" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Group size</p>
                                        <p className="font-semibold text-sm">Up to {maxGuests}</p>
                                    </div>
                                </div>
                            )}
                            <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/30 border border-border/50">
                                <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                                <div>
                                    <p className="text-xs text-muted-foreground">Level</p>
                                    <p className="font-semibold text-sm">Beginner Friendly</p>
                                </div>
                            </div>
                        </div>

                        {/* What's Included */}
                        {(exp.included_items as string[] | null)?.length! > 0 && (
                            <div className="space-y-3">
                                <h2 className="text-xl font-bold">What's included</h2>
                                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {(exp.included_items as string[]).map((item, i) => (
                                        <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Requirements */}
                        {(exp.requirements as string[] | null)?.length! > 0 && (
                            <div className="space-y-3">
                                <h2 className="text-xl font-bold">What to bring / requirements</h2>
                                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {(exp.requirements as string[]).map((req, i) => (
                                        <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <AlertTriangle className="h-4 w-4 text-orange-400 shrink-0" />
                                            {req}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    {/* ── RIGHT COLUMN (sticky booking card) ── */}
                    <div className="lg:col-span-1">
                        <div className="sticky top-20">
                            <Card className="shadow-xl border-2 border-border/50 overflow-hidden">
                                <CardHeader className="bg-muted/20 border-b border-border/50 pb-4">
                                    <CardTitle className="text-base">Check Availability</CardTitle>
                                    <p className="text-sm text-muted-foreground">
                                        From{' '}
                                        <span className="font-bold text-foreground">
                                            {symbol}{Number(exp.price_per_person).toLocaleString()}
                                        </span>{' '}
                                        / person
                                    </p>
                                </CardHeader>
                                <CardContent className="pt-5">
                                    <ExperienceSlotPicker
                                        tableId={exp.id}
                                        schedules={schedules as any[]}
                                        basePricePerPerson={Number(exp.price_per_person)}
                                        currency={exp.currency ?? 'PHP'}
                                        successUrl={successUrl}
                                        failureUrl={failureUrl}
                                        isLoggedIn={isLoggedIn}
                                    />
                                    <p className="text-xs text-center text-muted-foreground mt-4 flex items-center justify-center gap-1">
                                        <ShieldCheck className="h-3 w-3" />
                                        Secure payment via Xendit
                                    </p>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
