import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PublicEventCard } from '@/components/events/public-event-card'
import { Globe, Instagram, Facebook, Twitter, Calendar, Share2, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Metadata } from 'next'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export const dynamic = 'force-dynamic'

async function getPartnerAndEvents(slug: string) {
    console.log('[Storefront] Resolving slug:', slug)
    const supabase = await createClient()
    const { data: partner, error } = await supabase
        .from('partners')
        .select('*')
        .eq('slug', slug)
        .single()

    if (error) {
        console.error('[Storefront] Error finding slug:', slug, error)

        // Debug: Check if ANY partners are visible (RLS check)
        const { count } = await supabase.from('partners').select('*', { count: 'exact', head: true })
        console.log('[Storefront] Total visible partners in DB:', count)

        if (count === 0) {
            console.error('[Storefront] CRITICAL: 0 partners visible. RLS likely blocking access. Run allow_public_partner_read.sql!')
        } else {
            // Debug: List actual slugs
            const { data: slugs } = await supabase.from('partners').select('slug').limit(5)
            console.log('[Storefront] Sample visible slugs:', slugs?.map(s => s.slug))
        }
    }

    console.log('[Storefront] Partner found:', partner ? partner.business_name : 'No')

    if (!partner) return null

    const { data: events } = await supabase
        .from('events')
        .select('*')
        .eq('organizer_id', partner.id)
        .eq('status', 'active')
        .gte('start_datetime', new Date().toISOString())
        .order('start_datetime', { ascending: true })

    return { partner, events: events || [] }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const { slug } = await params
    const data = await getPartnerAndEvents(slug)
    if (!data) return { title: 'Organizer Not Found' }
    return {
        title: `${data.partner.business_name} - HangHut`,
        description: data.partner.description || `Browse events by ${data.partner.business_name}`,
        openGraph: {
            images: data.partner.cover_image_url ? [data.partner.cover_image_url] : [],
        }
    }
}

export default async function StorefrontPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    const data = await getPartnerAndEvents(slug)

    if (!data) notFound()

    const { partner, events } = data
    const social = partner.social_links || {}

    return (
        <div className="min-h-screen bg-background font-sans">
            {/* Immersive Hero Section */}
            <div className="relative w-full h-[400px] md:h-[500px] overflow-hidden group">
                {partner.cover_image_url ? (
                    <>
                        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent z-10" />
                        <img
                            src={partner.cover_image_url}
                            alt="Cover"
                            className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                        />
                    </>
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-900 via-purple-900 to-black z-0 flex items-center justify-center">
                        <div className="text-white/10 font-bold text-9xl select-none tracking-tighter">
                            {partner.business_name.slice(0, 2).toUpperCase()}
                        </div>
                    </div>
                )}
            </div>

            {/* Profile Content Container */}
            <div className="container mx-auto px-4 relative z-20 -mt-32 pb-20">
                <div className="flex flex-col lg:flex-row gap-8 items-start">

                    {/* Left Column: Brand Identity Card */}
                    <div className="w-full lg:w-[350px] shrink-0 space-y-6 sticky top-24">
                        <div className="bg-card/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl dark:shadow-none overflow-hidden relative">
                            {/* Decorative highlight */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 blur-[60px] rounded-full pointer-events-none" />

                            <div className="relative flex flex-col items-center text-center">
                                {/* Logo Avatar */}
                                <div className="w-32 h-32 rounded-full p-1 bg-background shadow-xl mb-4 relative z-10">
                                    <div className="w-full h-full rounded-full overflow-hidden bg-muted flex items-center justify-center">
                                        {partner.profile_photo_url ? (
                                            <img
                                                src={partner.profile_photo_url}
                                                alt={partner.business_name}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <span className="text-3xl font-bold text-primary">{partner.business_name.charAt(0)}</span>
                                        )}
                                    </div>
                                    {partner.verified && (
                                        <div className="absolute bottom-1 right-1 bg-blue-500 text-white p-1.5 rounded-full ring-4 ring-background" title="Verified Partner">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                    )}
                                </div>

                                <h1 className="text-2xl font-bold tracking-tight mb-1">{partner.business_name}</h1>
                                <p className="text-sm text-muted-foreground mb-4">@{partner.slug}</p>

                                <div className="flex gap-2 mb-6">
                                    {social.website && (
                                        <Button variant="outline" size="icon" className="h-8 w-8 rounded-full hover:text-primary hover:border-primary transition-colors" asChild>
                                            <a href={social.website} target="_blank" rel="noopener"><Globe className="h-4 w-4" /></a>
                                        </Button>
                                    )}
                                    {social.instagram && (
                                        <Button variant="outline" size="icon" className="h-8 w-8 rounded-full hover:text-pink-500 hover:border-pink-500 transition-colors" asChild>
                                            <a href={social.instagram} target="_blank" rel="noopener"><Instagram className="h-4 w-4" /></a>
                                        </Button>
                                    )}
                                    {social.facebook && (
                                        <Button variant="outline" size="icon" className="h-8 w-8 rounded-full hover:text-blue-600 hover:border-blue-600 transition-colors" asChild>
                                            <a href={social.facebook} target="_blank" rel="noopener"><Facebook className="h-4 w-4" /></a>
                                        </Button>
                                    )}
                                    {social.twitter && (
                                        <Button variant="outline" size="icon" className="h-8 w-8 rounded-full hover:text-sky-500 hover:border-sky-500 transition-colors" asChild>
                                            <a href={social.twitter} target="_blank" rel="noopener"><Twitter className="h-4 w-4" /></a>
                                        </Button>
                                    )}
                                </div>

                                <div className="w-full space-y-2">
                                    <Button className="w-full rounded-xl bg-primary hover:bg-primary/90 font-medium shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]">
                                        Follow
                                    </Button>
                                    <Button variant="outline" className="w-full rounded-xl border-dashed">
                                        <Share2 className="h-4 w-4 mr-2" />
                                        Share Profile
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Mini Stats or Info */}
                        <div className="bg-card border rounded-2xl p-4 flex justify-around text-center">
                            <div>
                                <div className="text-2xl font-bold">{events.length}</div>
                                <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Events</div>
                            </div>
                            <div className="w-px bg-border my-1" />
                            <div>
                                <div className="text-2xl font-bold">4.9</div>
                                <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Rating</div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Content */}
                    <div className="flex-1 min-w-0 pt-8 lg:pt-0 space-y-8">

                        {/* Bio Section */}
                        {partner.description && (
                            <div className="prose dark:prose-invert max-w-none">
                                <h2 className="text-3xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/60">About Us</h2>
                                <p className="text-lg leading-relaxed text-muted-foreground">{partner.description}</p>
                            </div>
                        )}

                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h2 className="text-2xl font-bold flex items-center gap-2">
                                    <Calendar className="h-6 w-6 text-primary" />
                                    Upcoming Events
                                </h2>
                                {/* Could add View All link here */}
                            </div>

                            {events.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {events.map((event: any) => (
                                        <PublicEventCard key={event.id} event={event} />
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed border-muted rounded-3xl bg-muted/10 text-center">
                                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                                        <Calendar className="h-8 w-8 text-muted-foreground" />
                                    </div>
                                    <h3 className="text-xl font-semibold mb-1">No Upcoming Events</h3>
                                    <p className="text-muted-foreground max-w-sm">
                                        {partner.business_name} hasn't scheduled any upcoming events yet. Follow them to get notified!
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
