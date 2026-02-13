import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import { PublicEventCard } from '@/components/events/public-event-card'
import { Globe, Instagram, Facebook, Twitter, Calendar, MapPin, Megaphone, X, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Metadata } from 'next'
import { Inter, Playfair_Display, Space_Mono } from 'next/font/google'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BrandingProvider } from '@/components/storefront/branding-provider'
import { StorefrontHeroVideo } from '@/components/storefront/storefront-hero-video'
import { ProfileActions } from '@/components/storefront/profile-actions'
import { cn, getYouTubeEmbedUrl } from '@/lib/utils'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-serif' })
const spaceMono = Space_Mono({ weight: '400', subsets: ['latin'], variable: '--font-mono' })

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
        return null
    }

    console.log('[Storefront] Partner found:', partner.business_name)

    const now = new Date().toISOString()
    const showPast = partner.branding?.content?.show_past_events ?? false

    // Parallel fetch for events
    const queries = [
        supabase
            .from('events')
            .select('*')
            .eq('organizer_id', partner.id)
            .eq('status', 'active')
            .gte('start_datetime', now)
            .order('start_datetime', { ascending: true })
    ]

    if (showPast) {
        queries.push(
            supabase
                .from('events')
                .select('*')
                .eq('organizer_id', partner.id)
                .eq('status', 'active')
                .lt('start_datetime', now)
                .order('start_datetime', { ascending: false })
                .limit(12)
        )
    }

    const results = await Promise.all(queries)
    const upcoming = results[0]?.data || []
    const past = showPast && results[1] ? (results[1].data || []) : []

    return { partner, upcoming, past }
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
        },
        icons: {
            icon: data.partner.branding?.favicon_url || data.partner.profile_photo_url || '/favicon.ico',
        }
    }
}

export default async function StorefrontPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    const data = await getPartnerAndEvents(slug)

    if (!data) notFound()

    const { partner, upcoming, past } = data
    const social = partner.social_links || {}
    const branding = partner.branding || {}
    const layout = branding.design?.layout || 'modern'
    const fontPreference = branding.design?.font || 'sans'
    const showFooter = branding.design?.show_footer ?? true
    const enableAnimations = branding.design?.enable_animations ?? true
    const announcement = branding.announcement || {}
    const sortBy = branding.content?.sort_by || 'upcoming'

    // Sort Upcoming Events
    const sortedUpcoming = [...upcoming].sort((a, b) => {
        if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        if (sortBy === 'alpha') return a.title.localeCompare(b.title)
        // Default 'upcoming' is already sorted by DB, but safe to retain
        return new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
    })

    // Font Mapping
    const fontMap = {
        'sans': inter.className,
        'serif': playfair.className,
        'mono': spaceMono.className
    }
    const fontClass = fontMap[fontPreference as keyof typeof fontMap] || inter.className

    // Animation Helpers
    const animate = (delay: string = '') => enableAnimations ? `animate-in fade-in slide-in-from-bottom-4 duration-700 ${delay} fill-mode-both` : ''

    // Helper for Social Buttons
    const SocialButtons = () => (
        <div className="flex gap-2 mb-6 justify-center lg:justify-start">
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
    )

    return (
        <BrandingProvider branding={branding}>
            {/* Dynamic Font Class Wrapper */}
            <div className={cn("min-h-screen bg-background flex flex-col", fontClass)}>

                {/* Announcement Bar */}
                {announcement.enabled && announcement.text && (
                    <div className="bg-primary text-primary-foreground px-4 py-3 relative text-center">
                        <p className="text-sm font-medium flex items-center justify-center gap-2">
                            <Megaphone className="h-4 w-4 animate-pulse" />
                            {announcement.link ? (
                                <a href={announcement.link} target="_blank" className="hover:underline underline-offset-4">
                                    {announcement.text}
                                </a>
                            ) : (
                                <span>{announcement.text}</span>
                            )}
                        </p>
                    </div>
                )}

                {/* --- MODERN LAYOUT (Default) --- */}
                {layout === 'modern' && (
                    <>
                        {/* Immersive Hero Section */}
                        <div className={cn("relative w-full h-[400px] md:h-[500px] overflow-hidden group", animate())}>
                            {branding.video_url ? (
                                <>
                                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent z-10 pointer-events-none" />
                                    <StorefrontHeroVideo videoUrl={branding.video_url} />
                                </>
                            ) : partner.cover_image_url ? (
                                <>
                                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent z-10" />
                                    <Image
                                        src={partner.cover_image_url}
                                        alt="Cover"
                                        fill
                                        sizes="100vw"
                                        className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                                        priority
                                    />
                                </>
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-primary/20 via-background to-background z-0 flex items-center justify-center">
                                    <div className="text-primary/10 font-bold text-9xl select-none tracking-tighter">
                                        {partner.business_name.slice(0, 2).toUpperCase()}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Profile Content Container */}
                        <div className="container mx-auto px-4 relative z-20 -mt-32 pb-20 flex-grow">
                            <div className="flex flex-col lg:flex-row gap-8 items-start">

                                {/* Left Column: Brand Identity Card */}
                                <div className={cn("w-full lg:w-[350px] shrink-0 space-y-6", animate('delay-100'))}>
                                    <div className="bg-card/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl dark:shadow-none overflow-hidden relative">
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

                                            <SocialButtons />

                                            <div className="w-full space-y-2">
                                                <ProfileActions shareUrl={`https://hanghut.com/${partner.slug}`} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Mini Stats */}
                                    <div className={cn("bg-card border rounded-2xl p-4 flex justify-around text-center", animate('delay-200'))}>
                                        <div>
                                            <div className="text-2xl font-bold">{upcoming.length}</div>
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
                                <div className={cn("flex-1 min-w-0 pt-8 lg:pt-0 space-y-8", animate('delay-300'))}>
                                    {(branding.description_html || partner.description) && (
                                        <div className="prose dark:prose-invert max-w-none">
                                            <h2 className="text-3xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/60">About Us</h2>
                                            {branding.description_html ? (
                                                <div dangerouslySetInnerHTML={{ __html: branding.description_html }} />
                                            ) : (
                                                <p className="text-lg leading-relaxed text-muted-foreground">{partner.description}</p>
                                            )}
                                        </div>
                                    )}

                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between">
                                            <h2 className="text-2xl font-bold flex items-center gap-2">
                                                <Calendar className="h-6 w-6 text-primary" />
                                                Upcoming Events
                                            </h2>
                                            {sortBy !== 'upcoming' && (
                                                <Badge variant="outline" className="text-muted-foreground">
                                                    Sorted by {sortBy === 'newest' ? 'Newest' : 'A-Z'}
                                                </Badge>
                                            )}
                                        </div>

                                        {sortedUpcoming.length > 0 ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                {sortedUpcoming.map((event: any) => (
                                                    <div key={event.id} className={animate('delay-500')}>
                                                        <PublicEventCard event={event} />
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <EmptyState partnerName={partner.business_name} />
                                        )}
                                    </div>

                                    {/* Past Events Section */}
                                    {past.length > 0 && (
                                        <div className={cn("space-y-6 pt-8 border-t opacity-80 hover:opacity-100 transition-opacity", animate('delay-700'))}>
                                            <div className="flex items-center gap-2">
                                                <h2 className="text-xl font-bold text-muted-foreground flex items-center gap-2">
                                                    <History className="h-5 w-5" />
                                                    Past Events
                                                </h2>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 opacity-75">
                                                {past.map((event: any) => (
                                                    <div key={event.id} className="grayscale hover:grayscale-0 transition-all">
                                                        <PublicEventCard event={event} />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* --- CLASSIC LAYOUT --- */}
                {layout === 'classic' && (
                    <>
                        <div className="relative w-full bg-background pb-12">
                            {/* Short Hero */}
                            <div className="relative w-full h-[300px] overflow-hidden group">
                                {branding.video_url ? (
                                    <>
                                        <div className="absolute inset-0 bg-black/40 z-10 pointer-events-none" />
                                        <StorefrontHeroVideo videoUrl={branding.video_url} />
                                    </>
                                ) : partner.cover_image_url ? (
                                    <>
                                        <div className="absolute inset-0 bg-black/40 z-10" />
                                        <Image
                                            src={partner.cover_image_url}
                                            alt="Cover"
                                            fill
                                            sizes="100vw"
                                            className="object-cover blur-sm scale-110"
                                        />
                                    </>
                                ) : (
                                    <div className="w-full h-full bg-primary/10" />
                                )}

                            </div>

                            {/* Centered Profile Info (Moved below hero) */}
                            <div className={cn("relative z-20 flex flex-col items-center justify-center text-center px-4 -mt-16 mb-8", animate('delay-200'))}>
                                <div className="w-32 h-32 rounded-full border-[6px] border-background bg-background overflow-hidden mb-4 shadow-2xl">
                                    {partner.profile_photo_url ? (
                                        <img src={partner.profile_photo_url} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full bg-muted flex items-center justify-center">
                                            <span className="text-4xl font-bold text-muted-foreground">{partner.business_name.charAt(0)}</span>
                                        </div>
                                    )}
                                </div>
                                <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-3 tracking-tight">{partner.business_name}</h1>

                                <SocialButtons />
                            </div>

                            <div className="container mx-auto px-4 max-w-5xl relative z-30">
                                <div className={cn("bg-card rounded-xl p-8 shadow-sm border space-y-8 min-h-[400px]", animate('delay-300'))}>
                                    {(branding.description_html || partner.description) && (
                                        <div className="text-center max-w-2xl mx-auto space-y-4">
                                            {branding.description_html ? (
                                                <div className="prose dark:prose-invert max-w-none text-left" dangerouslySetInnerHTML={{ __html: branding.description_html }} />
                                            ) : (
                                                <>
                                                    <p className="text-lg text-muted-foreground leading-relaxed">{partner.description}</p>
                                                    <div className="w-16 h-1 bg-primary mx-auto rounded-full" />
                                                </>
                                            )}
                                        </div>
                                    )}

                                    <div className="space-y-6">
                                        <h2 className="text-2xl font-bold text-center">Events</h2>
                                        {sortedUpcoming.length > 0 ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                {sortedUpcoming.map((event: any) => (
                                                    <div key={event.id} className={animate('delay-500')}>
                                                        <PublicEventCard event={event} />
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <EmptyState partnerName={partner.business_name} />
                                        )}
                                    </div>

                                    {/* Past Events for Classic */}
                                    {past.length > 0 && (
                                        <div className={cn("space-y-6 pt-8 border-t", animate('delay-700'))}>
                                            <h2 className="text-xl font-bold text-center text-muted-foreground">Past Events</h2>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-75">
                                                {past.map((event: any) => (
                                                    <div key={event.id} className="grayscale hover:grayscale-0 transition-all">
                                                        <PublicEventCard event={event} />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex-grow" /> {/* Spacer */}
                    </>
                )}

                {/* --- FOOTER --- */}
                {showFooter && (
                    <footer className="border-t bg-muted/30 mt-auto">
                        <div className="container mx-auto px-4 py-8">
                            <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-foreground">{partner.business_name}</span>
                                    <span>© {new Date().getFullYear()}</span>
                                </div>
                                <div className="flex items-center gap-6">
                                    {social.website && <a href={social.website} target="_blank" className="hover:text-foreground">Website</a>}
                                    {social.instagram && <a href={social.instagram} target="_blank" className="hover:text-foreground">Instagram</a>}
                                    {social.facebook && <a href={social.facebook} target="_blank" className="hover:text-foreground">Facebook</a>}
                                </div>
                                <div className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
                                    <span>Powered by</span>
                                    <span className="font-bold tracking-tight text-foreground">HangHut</span>
                                </div>
                            </div>
                        </div>
                    </footer>
                )}
            </div>
        </BrandingProvider>
    )
}

function EmptyState({ partnerName }: { partnerName: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed border-muted rounded-3xl bg-muted/10 text-center w-full">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                <Calendar className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-1">No Upcoming Events</h3>
            <p className="text-muted-foreground max-w-sm">
                {partnerName} hasn't scheduled any upcoming events yet. Follow them to get notified!
            </p>
        </div>
    )
}
