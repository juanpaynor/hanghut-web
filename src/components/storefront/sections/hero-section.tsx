import Image from 'next/image'
import { StorefrontHeroVideo } from '../storefront-hero-video'
import { ProfileActions } from '../profile-actions'
import { Globe, Instagram, Facebook, Twitter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface HeroSectionProps {
    config: {
        variant?: 'fullbleed' | 'split' | 'minimal' | 'video'
        overlay_text?: string
        cta_text?: string
        cta_link?: string
        height?: 'short' | 'default' | 'tall'
    }
    partner: {
        business_name: string
        profile_photo_url?: string | null
        cover_image_url?: string | null
        verified?: boolean
        slug?: string
        description?: string | null
        social_links?: Record<string, string>
    }
    branding: Record<string, any>
}

const heightMap = {
    short: 'h-[250px] md:h-[300px]',
    default: 'h-[400px] md:h-[500px]',
    tall: 'h-[500px] md:h-[650px]',
}

function SocialButtons({ social }: { social: Record<string, string> }) {
    if (!social) return null
    const has = social.website || social.instagram || social.facebook || social.twitter
    if (!has) return null
    return (
        <div className="flex gap-2 flex-wrap">
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
}

function VerifiedBadge() {
    return (
        <div className="bg-blue-500 text-white p-1 rounded-full ring-4 ring-background inline-flex" title="Verified Partner">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
        </div>
    )
}

export function HeroSection({ config, partner, branding }: HeroSectionProps) {
    const variant = config.variant || 'fullbleed'
    const height = heightMap[config.height || 'default']
    const videoUrl = branding.video_url
    const coverUrl = partner.cover_image_url
    const overlayText = config.overlay_text || partner.business_name
    const ctaText = config.cta_text
    const ctaLink = config.cta_link
    const social = partner.social_links || {}
    const tagline = branding.tagline

    // ─── Minimal: Text-only hero ───
    if (variant === 'minimal') {
        return (
            <section className="relative w-full py-16 md:py-24 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background" />
                <div className="container mx-auto px-4 relative z-10 text-center">
                    {partner.profile_photo_url && (
                        <div className="relative w-20 h-20 rounded-full mx-auto mb-6 overflow-hidden border-2 border-border shadow-lg">
                            <img src={partner.profile_photo_url} alt={partner.business_name} className="w-full h-full object-cover" />
                        </div>
                    )}
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">{partner.business_name}</h1>
                        {partner.verified && <VerifiedBadge />}
                    </div>
                    {partner.slug && (
                        <p className="text-sm text-muted-foreground mb-3">@{partner.slug}</p>
                    )}
                    {tagline && (
                        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-6">{tagline}</p>
                    )}
                    <div className="flex items-center justify-center gap-4 mb-4">
                        <SocialButtons social={social} />
                    </div>
                    <div className="max-w-xs mx-auto">
                        <ProfileActions shareUrl={`https://hanghut.com/${partner.slug}`} />
                    </div>
                    {ctaText && ctaLink && (
                        <a
                            href={ctaLink}
                            className="inline-flex items-center gap-2 mt-6 px-8 py-3 bg-primary text-primary-foreground rounded-full font-semibold hover:opacity-90 transition-opacity"
                        >
                            {ctaText}
                        </a>
                    )}
                </div>
            </section>
        )
    }

    // ─── Split: Left image, right text ───
    if (variant === 'split') {
        return (
            <section className="relative w-full overflow-hidden">
                <div className="container mx-auto px-4 py-12 md:py-20">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
                        {/* Image side */}
                        <div className="relative aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl group">
                            {coverUrl ? (
                                <Image
                                    src={coverUrl}
                                    alt={partner.business_name}
                                    fill
                                    sizes="(max-width: 1024px) 100vw, 50vw"
                                    className="object-cover group-hover:scale-105 transition-transform duration-700"
                                    priority
                                />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-primary/20 via-primary/5 to-background flex items-center justify-center">
                                    <span className="text-primary/10 font-bold text-9xl select-none">
                                        {partner.business_name.slice(0, 2).toUpperCase()}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Text side */}
                        <div className="space-y-5">
                            {partner.profile_photo_url && (
                                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-border shadow-md">
                                    <img src={partner.profile_photo_url} alt={partner.business_name} className="w-full h-full object-cover" />
                                </div>
                            )}
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
                                        {overlayText}
                                    </h1>
                                    {partner.verified && <VerifiedBadge />}
                                </div>
                                {partner.slug && (
                                    <p className="text-sm text-muted-foreground">@{partner.slug}</p>
                                )}
                            </div>
                            {tagline && (
                                <p className="text-lg text-muted-foreground">{tagline}</p>
                            )}
                            <SocialButtons social={social} />
                            <div className="max-w-xs">
                                <ProfileActions shareUrl={`https://hanghut.com/${partner.slug}`} />
                            </div>
                            {ctaText && ctaLink && (
                                <a
                                    href={ctaLink}
                                    className="inline-flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground rounded-full font-semibold hover:opacity-90 transition-opacity"
                                >
                                    {ctaText}
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            </section>
        )
    }

    // ─── Fullbleed / Video: Immersive cover ───
    return (
        <section className={cn('relative w-full overflow-hidden group', height)}>
            {/* Media */}
            {videoUrl ? (
                <>
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent z-10 pointer-events-none" />
                    <StorefrontHeroVideo videoUrl={videoUrl} />
                </>
            ) : coverUrl ? (
                <>
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent z-10" />
                    <Image
                        src={coverUrl}
                        alt="Cover"
                        fill
                        sizes="100vw"
                        className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                        priority
                    />
                </>
            ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary/20 via-background to-background flex items-center justify-center">
                    <div className="text-primary/10 font-bold text-9xl select-none tracking-tighter">
                        {partner.business_name.slice(0, 2).toUpperCase()}
                    </div>
                </div>
            )}

            {/* Overlay Content */}
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-end pb-12 md:pb-20 px-4 text-center">
                {partner.profile_photo_url && (
                    <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white/30 shadow-xl mb-4">
                        <img src={partner.profile_photo_url} alt={partner.business_name} className="w-full h-full object-cover" />
                    </div>
                )}
                <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-3xl md:text-5xl font-bold text-white drop-shadow-lg max-w-3xl">
                        {overlayText}
                    </h1>
                    {partner.verified && (
                        <div className="bg-blue-500 text-white p-1 rounded-full ring-2 ring-white/30 inline-flex">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                    )}
                </div>
                {partner.slug && (
                    <p className="text-sm text-white/60 mb-2">@{partner.slug}</p>
                )}
                {tagline && (
                    <p className="text-lg text-white/80 drop-shadow-md max-w-xl mb-4">{tagline}</p>
                )}
                {ctaText && ctaLink && (
                    <a
                        href={ctaLink}
                        className="px-8 py-3 bg-white/90 text-black rounded-full font-semibold hover:bg-white transition-colors shadow-lg"
                    >
                        {ctaText}
                    </a>
                )}
            </div>
        </section>
    )
}
