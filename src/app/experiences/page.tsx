import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { ShieldCheck, MapPin, Search, Star } from 'lucide-react'
import { formatInManila } from '@/lib/datetime'
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

interface ExperienceCard {
    id: string
    title: string
    description: string | null
    location_name: string
    experience_type: string | null
    images: string[] | null
    price_per_person: number | null
    currency: string | null
    host_id: string
    host_name: string
    host_photo_url: string | null
    verified_by_hanghut: boolean
    next_start_time: string
    upcoming_slots: number
    rating_avg: number
    rating_count: number
    total_count: number
}

export default async function ExperiencesPage({ searchParams }: ExperiencesPageProps) {
    const { type } = await searchParams
    const supabase = await createClient()
    const activeType = type || 'all'

    // ONE round trip. get_experiences_index (migration 20261012130000) does the
    // "has a bookable future date" test in SQL, resolves the host, and returns
    // the rating already averaged.
    //
    // What this replaced: four queries finished off in JavaScript. The first
    // embedded EVERY schedule of EVERY listing — never rendered, fetched only
    // to answer "is there a future date?" — and the last pulled EVERY review
    // row to average in JS. Both are "read the whole table for one number per
    // listing", which is invisible at six schedule rows and fatal once
    // availability is generated. The middle two built a hostMap the markup
    // never used at all.
    const { data, error } = await supabase.rpc('get_experiences_index', {
        p_type: activeType === 'all' ? null : activeType,
        p_limit: 48,
        p_offset: 0,
    })

    // A failed RPC must render the empty state, not crash the page — this is
    // an anonymous, cacheable public route.
    if (error) console.error('get_experiences_index failed:', error.message)
    const experiences = (data ?? []) as ExperienceCard[]

    const types = ['all', 'nightlife', 'workshop', 'adventure', 'food_tour', 'culture']

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
                            const images = exp.images ?? []
                            const heroImage = images[0]
                            const symbol = exp.currency === 'PHP' ? '₱' : (exp.currency ?? '₱')

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
                                                {/* Rating. Hidden until there is one — a "0.0 (0)" on
                                                    every card reads as "nobody liked this" rather than
                                                    "nobody has been yet". */}
                                                {exp.rating_count > 0 && (
                                                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                                                        <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                                                        <span className="text-xs font-semibold">{exp.rating_avg}</span>
                                                        <span className="text-xs text-muted-foreground">({exp.rating_count})</span>
                                                    </div>
                                                )}
                                            </div>
                                            {exp.location_name && (
                                                <p className="text-xs text-muted-foreground line-clamp-1">
                                                    {exp.location_name}
                                                </p>
                                            )}
                                            {/* The next bookable date. The RPC already computes it,
                                                and on a listing that recurs it is the single most
                                                useful thing on the card — "is this on soon?" is the
                                                question a browser is actually asking. */}
                                            <p className="text-xs text-muted-foreground line-clamp-1">
                                                Next {formatInManila(exp.next_start_time, { weekday: 'short', month: 'short', day: 'numeric' })}
                                                {exp.upcoming_slots > 1 && (
                                                    <span className="text-muted-foreground/70">
                                                        {' '}· {exp.upcoming_slots} dates
                                                    </span>
                                                )}
                                            </p>
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
