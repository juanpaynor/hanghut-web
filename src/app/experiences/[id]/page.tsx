import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ShieldCheck, Users, Clock, AlertTriangle, CheckCircle, ArrowLeft, MapPin, Package, Star } from 'lucide-react'
import type { Metadata } from 'next'
import { ExperienceHeroCarousel } from '@/components/experiences/experience-hero-carousel'
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

    // Fetch host display name + profile photo
    const [{ data: hostUser }, { data: hostPhoto }] = await Promise.all([
        supabase
            .from('users')
            .select('display_name, avatar_url')
            .eq('id', exp.host_id)
            .single(),
        supabase
            .from('user_photos')
            .select('photo_url')
            .eq('user_id', exp.host_id)
            .eq('is_primary', true)
            .single()
    ])

    // Fetch reviews with user info
    const { data: rawReviews } = await supabase
        .from('experience_reviews')
        .select('*, user:users!user_id(id, display_name)')
        .eq('experience_id', id)
        .order('created_at', { ascending: false })

    const reviews = rawReviews ?? []

    // Fetch reviewer photos
    const reviewerIds = reviews.map((r: any) => r.user_id).filter(Boolean)
    let reviewerPhotoMap: Record<string, string> = {}
    if (reviewerIds.length > 0) {
        const { data: reviewerPhotos } = await supabase
            .from('user_photos')
            .select('user_id, photo_url')
            .in('user_id', reviewerIds)
            .eq('is_primary', true)
        reviewerPhotos?.forEach((p: any) => { reviewerPhotoMap[p.user_id] = p.photo_url })
    }

    // Compute review stats
    const reviewCount = reviews.length
    const avgRating = reviewCount > 0
        ? Math.round(reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviewCount * 10) / 10
        : 0
    const avgCommunication = reviewCount > 0
        ? Math.round(reviews.filter((r: any) => r.communication_rating).reduce((s: number, r: any) => s + r.communication_rating, 0) / reviews.filter((r: any) => r.communication_rating).length * 10) / 10 || 0
        : 0
    const avgValue = reviewCount > 0
        ? Math.round(reviews.filter((r: any) => r.value_rating).reduce((s: number, r: any) => s + r.value_rating, 0) / reviews.filter((r: any) => r.value_rating).length * 10) / 10 || 0
        : 0
    const avgOrganization = reviewCount > 0
        ? Math.round(reviews.filter((r: any) => r.organization_rating).reduce((s: number, r: any) => s + r.organization_rating, 0) / reviews.filter((r: any) => r.organization_rating).length * 10) / 10 || 0
        : 0

    const { data: { user } } = await supabase.auth.getUser()
    const isLoggedIn = !!user

    const images: string[] = (exp.images as string[]) ?? []
    const schedules = exp.experience_schedules ?? []
    const hostName: string = hostUser?.display_name ?? 'Your Host'
    const hostAvatarUrl: string | null = hostPhoto?.photo_url ?? exp.host_avatar_url ?? hostUser?.avatar_url ?? null
    const typeLabel = EXPERIENCE_TYPE_LABELS[exp.experience_type ?? ''] ?? 'Experience'
    const successUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/experiences/success`
    const failureUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/experiences/${id}`
    const symbol = exp.currency === 'PHP' ? '₱' : (exp.currency ?? '₱')

    // Stats
    const maxGuests = (schedules as any[]).reduce((max: number, s: any) => Math.max(max, s.max_guests ?? 0), 0)
    const minDurationMs = (schedules as any[]).reduce((min: number, s: any) => {
        if (!s.start_time || !s.end_time) return min
        const dur = new Date(s.end_time).getTime() - new Date(s.start_time).getTime()
        return min === 0 ? dur : Math.min(min, dur)
    }, 0)
    const durationHours = minDurationMs > 0 ? Math.round(minDurationMs / 1000 / 60 / 60 * 10) / 10 : null

    // Mapbox
    const mbToken = process.env.MAPBOX_PUBLIC_TOKEN || ''
    const hasMap = !!(exp.latitude && exp.longitude && mbToken)
    const mapUrl = hasMap
        ? `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/pin-l+4F46E5(${exp.longitude},${exp.latitude})/${exp.longitude},${exp.latitude},14,0/800x300@2x?access_token=${mbToken}`
        : ''

    const includedItems = (exp.included_items as string[] | null) ?? []
    const requirements = (exp.requirements as string[] | null) ?? []

    return (
        <div className="min-h-screen bg-background pb-24">
            {/* Navbar */}
            <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur">
                <div className="container mx-auto px-4 flex h-14 items-center gap-4">
                    <Link href="/" className="flex items-center gap-2 font-bold text-xl hover:opacity-80 transition-opacity">
                        <div className="bg-primary px-3 py-1 rounded-md text-primary-foreground transform -rotate-2 text-base">
                            HANGHUT
                        </div>
                    </Link>
                    <nav className="hidden md:flex items-center gap-6 ml-auto text-sm font-medium">
                        <Link href="/experiences" className="text-muted-foreground hover:text-foreground transition-colors">Explore</Link>
                    </nav>
                </div>
            </header>

            <main className="container mx-auto px-4 pt-6 max-w-6xl">
                <Link
                    href="/experiences"
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
                >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to Experiences
                </Link>

                {/* ═══ HERO CAROUSEL WITH TITLE OVERLAY ═══ */}
                <ExperienceHeroCarousel
                    images={images}
                    videoUrl={exp.video_url}
                    title={exp.title}
                    locationName={exp.location_name}
                />

                {/* ═══ HOST BAR + PRICE (side by side on desktop) ═══ */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-6 pb-6 border-b border-border/50">
                    {/* Host */}
                    <div className="flex items-center gap-3">
                        <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-background shadow-md bg-muted shrink-0">
                            {hostAvatarUrl ? (
                                <img src={hostAvatarUrl} alt={hostName} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full bg-primary/20 flex items-center justify-center">
                                    <span className="text-xl font-bold text-primary">{hostName?.charAt(0).toUpperCase()}</span>
                                </div>
                            )}
                            {exp.verified_by_hanghut && (
                                <div className="absolute -bottom-0.5 -right-0.5 bg-blue-500 rounded-full p-0.5">
                                    <ShieldCheck className="h-3 w-3 text-white" />
                                </div>
                            )}
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-widest text-primary font-bold">Your Host</p>
                            <p className="text-sm font-semibold">{hostName}</p>
                        </div>
                    </div>

                    {/* Price + badge */}
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <span className="text-2xl font-bold">{symbol}{Number(exp.price_per_person).toLocaleString()}</span>
                            <span className="text-sm text-muted-foreground ml-1">/person</span>
                        </div>
                        <Badge variant="outline" className="uppercase tracking-widest text-[10px] font-bold px-3 py-1 shrink-0">
                            {typeLabel}
                        </Badge>
                    </div>
                </div>

                {/* ═══ MAIN CONTENT GRID ═══ */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 mt-8">

                    {/* ── LEFT COLUMN (3/5) ── */}
                    <div className="lg:col-span-2 space-y-8">

                        {/* The Experience */}
                        {exp.description && (
                            <div className="space-y-3">
                                <h2 className="text-2xl font-extrabold">The Experience</h2>
                                <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap text-[15px]">
                                    {exp.description}
                                </p>
                            </div>
                        )}

                        {/* Quick Stats row */}
                        <div className="flex flex-wrap gap-3">
                            {durationHours && (
                                <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-muted/40 border border-border/50">
                                    <Clock className="h-4 w-4 text-primary" />
                                    <span className="text-sm font-medium">{durationHours} hr{durationHours !== 1 ? 's' : ''}</span>
                                </div>
                            )}
                            {maxGuests > 0 && (
                                <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-muted/40 border border-border/50">
                                    <Users className="h-4 w-4 text-primary" />
                                    <span className="text-sm font-medium">Up to {maxGuests} guests</span>
                                </div>
                            )}
                        </div>

                        {/* What's Included + What to Bring (side by side) */}
                        {(includedItems.length > 0 || requirements.length > 0) && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                {includedItems.length > 0 && (
                                    <div className="space-y-3">
                                        <h3 className="text-base font-bold flex items-center gap-2">
                                            <CheckCircle className="h-4 w-4 text-green-500" />
                                            What's Included
                                        </h3>
                                        <ul className="space-y-2">
                                            {includedItems.map((item, i) => (
                                                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                                    <span className="text-muted-foreground/50 mt-1">•</span>
                                                    {item}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {requirements.length > 0 && (
                                    <div className="space-y-3">
                                        <h3 className="text-base font-bold flex items-center gap-2">
                                            <Package className="h-4 w-4 text-orange-400" />
                                            What to Bring
                                        </h3>
                                        <ul className="space-y-2">
                                            {requirements.map((req, i) => (
                                                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                                    <span className="text-muted-foreground/50 mt-1">•</span>
                                                    {req}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Where we'll meet — Map */}
                        {hasMap && (
                            <div className="space-y-3">
                                <h2 className="text-2xl font-extrabold">Where we'll meet</h2>
                                <a
                                    href={`https://www.mapbox.com/maps?lat=${exp.latitude}&lng=${exp.longitude}&zoom=14`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block relative rounded-2xl overflow-hidden border-2 border-border/50 hover:border-primary/30 transition-all duration-300 group"
                                >
                                    <img
                                        src={mapUrl}
                                        alt={`Map showing ${exp.location_name}`}
                                        className="w-full h-[220px] object-cover"
                                    />
                                    {/* Venue label */}
                                    {exp.location_name && (
                                        <div className="absolute bottom-4 left-4 bg-background/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-lg border border-border/50 flex items-center gap-2">
                                            <MapPin className="h-4 w-4 text-primary shrink-0" />
                                            <span className="text-sm font-semibold">{exp.location_name}</span>
                                        </div>
                                    )}
                                    <div className="absolute bottom-4 right-4 bg-background/90 backdrop-blur-sm border border-border/50 rounded-lg px-3 py-1.5 text-xs font-medium shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                                        View on Map
                                    </div>
                                </a>
                            </div>
                        )}

                        {/* ═══ REVIEWS SECTION ═══ */}
                        {reviewCount > 0 && (
                            <div className="space-y-6">
                                <div className="flex items-center gap-3">
                                    <h2 className="text-2xl font-extrabold">Reviews</h2>
                                    <div className="flex items-center gap-1.5">
                                        <Star className="h-5 w-5 fill-primary text-primary" />
                                        <span className="text-lg font-bold">{avgRating}</span>
                                        <span className="text-sm text-muted-foreground">({reviewCount} review{reviewCount !== 1 ? 's' : ''})</span>
                                    </div>
                                </div>

                                {/* Category ratings */}
                                {(avgCommunication > 0 || avgValue > 0 || avgOrganization > 0) && (
                                    <div className="grid grid-cols-3 gap-4">
                                        {avgCommunication > 0 && (
                                            <div className="space-y-1">
                                                <p className="text-xs text-muted-foreground">Communication</p>
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                                        <div className="h-full bg-primary rounded-full" style={{ width: `${(avgCommunication / 5) * 100}%` }} />
                                                    </div>
                                                    <span className="text-xs font-semibold">{avgCommunication}</span>
                                                </div>
                                            </div>
                                        )}
                                        {avgValue > 0 && (
                                            <div className="space-y-1">
                                                <p className="text-xs text-muted-foreground">Value</p>
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                                        <div className="h-full bg-primary rounded-full" style={{ width: `${(avgValue / 5) * 100}%` }} />
                                                    </div>
                                                    <span className="text-xs font-semibold">{avgValue}</span>
                                                </div>
                                            </div>
                                        )}
                                        {avgOrganization > 0 && (
                                            <div className="space-y-1">
                                                <p className="text-xs text-muted-foreground">Organization</p>
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                                        <div className="h-full bg-primary rounded-full" style={{ width: `${(avgOrganization / 5) * 100}%` }} />
                                                    </div>
                                                    <span className="text-xs font-semibold">{avgOrganization}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Individual reviews */}
                                <div className="space-y-5">
                                    {reviews.map((review: any) => {
                                        const reviewerName = review.user?.display_name || 'Anonymous'
                                        const reviewerPhoto = reviewerPhotoMap[review.user_id] || null
                                        const reviewDate = new Date(review.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

                                        return (
                                            <div key={review.id} className="flex gap-3 pb-5 border-b border-border/50 last:border-0">
                                                <div className="w-10 h-10 rounded-full overflow-hidden bg-muted shrink-0">
                                                    {reviewerPhoto ? (
                                                        <img src={reviewerPhoto} alt={reviewerName} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                                                            <span className="text-sm font-bold text-primary">{reviewerName.charAt(0).toUpperCase()}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 space-y-1.5">
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-sm font-semibold">{reviewerName}</p>
                                                        <p className="text-xs text-muted-foreground">{reviewDate}</p>
                                                    </div>
                                                    <div className="flex items-center gap-0.5">
                                                        {Array.from({ length: 5 }).map((_, i) => (
                                                            <Star
                                                                key={i}
                                                                className={`h-3.5 w-3.5 ${i < review.rating ? 'fill-primary text-primary' : 'text-muted-foreground/30'}`}
                                                            />
                                                        ))}
                                                    </div>
                                                    {review.review_text && (
                                                        <p className="text-sm text-muted-foreground leading-relaxed">{review.review_text}</p>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── RIGHT COLUMN (2/5) — Booking Card ── */}
                    <div className="lg:col-span-1" id="booking">
                        <div className="sticky top-20">
                            <Card className="shadow-xl border-2 border-border/50 overflow-hidden">
                                <div className="p-5 border-b border-border/50">
                                    <div className="flex items-baseline justify-between">
                                        <div>
                                            <span className="text-2xl font-bold">{symbol}{Number(exp.price_per_person).toLocaleString()}</span>
                                            <span className="text-sm text-muted-foreground ml-1">/person</span>
                                        </div>
                                    </div>
                                </div>
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

                                    {/* Refund policy */}
                                    <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
                                        <ShieldCheck className="h-4 w-4 text-green-500 shrink-0 mt-0" />
                                        <span>
                                            <strong className="text-foreground">Protected Booking.</strong> Full refund if you cancel up to 48 hours before the event.
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            </main>

            {/* Mobile sticky booking bar */}
            <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-background/95 backdrop-blur border-t border-border px-4 py-3">
                <div className="flex items-center justify-between max-w-6xl mx-auto">
                    <div>
                        <span className="text-lg font-bold text-primary">
                            {symbol}{Number(exp.price_per_person).toLocaleString()}
                        </span>
                        <span className="text-sm text-muted-foreground ml-1">/ person</span>
                    </div>
                    <a
                        href="#booking"
                        className="inline-flex items-center justify-center h-10 px-6 rounded-md bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
                    >
                        Reserve Experience
                    </a>
                </div>
            </div>
        </div>
    )
}
