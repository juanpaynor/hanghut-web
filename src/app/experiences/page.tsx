import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { ShieldCheck, MapPin, Search, Star } from 'lucide-react'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Experiences — HangHut',
    description: 'Discover unique real-world experiences, workshops, food tours, nightlife, and adventures on HangHut.',
    openGraph: {
        title: 'Experiences — HangHut',
        description: 'Discover unique real-world experiences on HangHut.',
    },
}

const EXPERIENCE_TYPE_LABELS: Record<string, string> = {
    workshop: 'Workshops',
    adventure: 'Adventure',
    food_tour: 'Culinary',
    nightlife: 'Nightlife',
    culture: 'Art & Design',
    other: 'Experience',
}

interface ExperiencesPageProps {
    searchParams: Promise<{ type?: string }>
}

export default async function ExperiencesPage({ searchParams }: ExperiencesPageProps) {
    const { type } = await searchParams
    const supabase = await createClient()

    let query = supabase
        .from('tables')
        .select(`
            id,
            title,
            description,
            location_name,
            experience_type,
            images,
            price_per_person,
            currency,
            host_id,
            host_avatar_url,
            verified_by_hanghut,
            created_at,
            experience_schedules(id, start_time, max_guests, current_guests, status)
        `)
        .eq('is_experience', true)
        .order('created_at', { ascending: false })

    if (type && type !== 'all') {
        query = query.eq('experience_type', type)
    }

    const { data: experiences } = await query

    // Fetch host names + profile photos
    const hostIds = [...new Set((experiences || []).map(e => e.host_id).filter(Boolean))]
    let hostMap: Record<string, { name: string; photo: string | null }> = {}
    if (hostIds.length > 0) {
        const [{ data: hosts }, { data: photos }] = await Promise.all([
            supabase.from('users').select('id, display_name').in('id', hostIds),
            supabase.from('user_photos').select('user_id, photo_url').in('user_id', hostIds).eq('is_primary', true)
        ])

        const photoMap: Record<string, string> = {}
        photos?.forEach(p => { photoMap[p.user_id] = p.photo_url })
        hosts?.forEach(h => {
            hostMap[h.id] = { name: h.display_name || 'Host', photo: photoMap[h.id] || null }
        })
    }

    // Fetch reviews for all experiences (avg rating + count)
    const experienceIds = (experiences || []).map(e => e.id)
    let reviewMap: Record<string, { avg: number; count: number }> = {}
    if (experienceIds.length > 0) {
        const { data: allReviews } = await supabase
            .from('experience_reviews')
            .select('experience_id, rating')
            .in('experience_id', experienceIds)

        if (allReviews) {
            const grouped: Record<string, number[]> = {}
            allReviews.forEach(r => {
                if (!grouped[r.experience_id]) grouped[r.experience_id] = []
                grouped[r.experience_id].push(r.rating)
            })
            Object.entries(grouped).forEach(([id, ratings]) => {
                const avg = ratings.reduce((s, r) => s + r, 0) / ratings.length
                reviewMap[id] = { avg: Math.round(avg * 10) / 10, count: ratings.length }
            })
        }
    }

    const types = ['all', 'nightlife', 'workshop', 'adventure', 'food_tour', 'culture']
    const activeType = type || 'all'

    return (
        <div className="min-h-screen bg-background">
            {/* Navbar */}
            <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur">
                <div className="container mx-auto px-4 flex h-14 items-center justify-between">
                    <Link href="/" className="flex items-center gap-2 font-bold text-xl hover:opacity-80 transition-opacity">
                        <div className="bg-primary px-3 py-1 rounded-md text-primary-foreground transform -rotate-2 text-base">
                            HANGHUT
                        </div>
                    </Link>
                    <Link href="/experiences/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                        Log In
                    </Link>
                </div>
            </header>

            <main className="container mx-auto px-4 max-w-7xl">

                {/* ═══ HERO SECTION ═══ */}
                <section className="pt-12 pb-10">
                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.15]">
                        Curated experiences<br />
                        <span className="italic text-primary">designed for you.</span>
                    </h1>
                </section>

                {/* ═══ FILTER PILLS ═══ */}
                <div className="flex items-center gap-2 flex-wrap mb-8">
                    {types.map((t) => (
                        <Link
                            key={t}
                            href={t === 'all' ? '/experiences' : `/experiences?type=${t}`}
                            className={`
                                px-4 py-2 rounded-full text-sm font-medium border transition-all duration-200
                                ${activeType === t
                                    ? 'bg-primary text-primary-foreground border-primary shadow-md'
                                    : 'bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                                }
                            `}
                        >
                            {t === 'all' ? 'All Experiences' : EXPERIENCE_TYPE_LABELS[t]}
                        </Link>
                    ))}
                </div>

                {/* ═══ EXPERIENCE GRID ═══ */}
                {(!experiences || experiences.length === 0) ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
                        <Search className="h-12 w-12 opacity-30 mb-4" />
                        <p className="text-lg font-medium">No experiences found</p>
                        <p className="text-sm mt-1">Check back soon — new experiences are added regularly!</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-16">
                        {experiences.map((exp) => {
                            const images = (exp.images as string[]) ?? []
                            const heroImage = images[0]
                            const symbol = exp.currency === 'PHP' ? '₱' : (exp.currency ?? '₱')
                            const review = reviewMap[exp.id]

                            return (
                                <Link key={exp.id} href={`/experiences/${exp.id}`} className="group">
                                    <div className="space-y-2.5">
                                        {/* Image */}
                                        <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-muted">
                                            {heroImage ? (
                                                <img
                                                    src={heroImage}
                                                    alt={exp.title}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                />
                                            ) : (
                                                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/30">
                                                    <MapPin className="h-12 w-12" />
                                                </div>
                                            )}

                                            {/* Verified badge */}
                                            {exp.verified_by_hanghut && (
                                                <div className="absolute top-3 left-3">
                                                    <Badge className="gap-1 bg-green-500/90 text-white hover:bg-green-500 text-[10px] font-bold uppercase tracking-wider rounded-md px-2 py-1 shadow-sm">
                                                        <ShieldCheck className="h-3 w-3" />
                                                        Verified
                                                    </Badge>
                                                </div>
                                            )}

                                            {/* Heart icon */}
                                            <div className="absolute top-3 right-3">
                                                <div className="bg-white/90 backdrop-blur-sm rounded-full p-2 shadow-sm hover:bg-white transition-colors">
                                                    <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                                    </svg>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card info */}
                                        <div className="space-y-1 px-0.5">
                                            <div className="flex items-start justify-between gap-2">
                                                <h3 className="font-semibold text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                                                    {exp.title}
                                                </h3>
                                                {/* Rating */}
                                                {review && (
                                                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                                                        <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                                                        <span className="text-xs font-semibold">{review.avg}</span>
                                                        <span className="text-xs text-muted-foreground">({review.count})</span>
                                                    </div>
                                                )}
                                            </div>
                                            {exp.location_name && (
                                                <p className="text-xs text-muted-foreground line-clamp-1">
                                                    {exp.location_name}
                                                </p>
                                            )}
                                            <p className="text-sm pt-0.5">
                                                <span className="font-bold">{symbol}{Number(exp.price_per_person).toLocaleString()}</span>
                                                <span className="text-muted-foreground text-xs ml-1">/ person</span>
                                            </p>
                                        </div>
                                    </div>
                                </Link>
                            )
                        })}
                    </div>
                )}
            </main>
        </div>
    )
}
