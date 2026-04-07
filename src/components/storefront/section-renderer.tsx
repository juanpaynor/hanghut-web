import { StorefrontSection } from '@/lib/storefront/section-types'
import { HeroSection } from './sections/hero-section'
import { AboutSection } from './sections/about-section'
import { EventsSection } from './sections/events-section'
import { PastEventsSection } from './sections/past-events-section'
import { NewsletterSection } from './sections/newsletter-section'
import { DividerSection } from './sections/divider-section'
import { StatsSection } from './sections/stats-section'
import { CTASection } from './sections/cta-section'

interface SectionRendererProps {
    sections: StorefrontSection[]
    partner: {
        id: string
        business_name: string
        slug: string
        description?: string | null
        profile_photo_url?: string | null
        cover_image_url?: string | null
        verified?: boolean
        social_links?: Record<string, string>
        branding?: Record<string, any>
    }
    events: any[]
    pastEvents: any[]
}

export function SectionRenderer({ sections, partner, events, pastEvents }: SectionRendererProps) {
    const branding = partner.branding || {}

    return (
        <>
            {sections
                .filter((s) => s.visible)
                .map((section, index) => {
                    const key = `${section.type}-${index}`
                    
                    let content = null

                    switch (section.type) {
                        case 'hero':
                            content = (
                                <HeroSection
                                    config={section.config}
                                    partner={partner}
                                    branding={branding}
                                />
                            )
                            break
                        case 'about':
                            content = (
                                <AboutSection
                                    config={section.config}
                                    description={partner.description}
                                    descriptionHtml={branding.description_html}
                                />
                            )
                            break
                        case 'events':
                            content = (
                                <EventsSection
                                    config={section.config}
                                    events={events}
                                    sortBy={branding.content?.sort_by}
                                />
                            )
                            break
                        case 'past_events':
                            content = (
                                <PastEventsSection
                                    config={section.config}
                                    events={pastEvents}
                                />
                            )
                            break
                        case 'newsletter':
                            content = (
                                <NewsletterSection
                                    config={section.config}
                                    partnerId={partner.id}
                                    partnerName={partner.business_name}
                                />
                            )
                            break
                        case 'stats':
                            content = (
                                <StatsSection
                                    config={section.config}
                                />
                            )
                            break
                        case 'cta':
                            content = (
                                <CTASection
                                    config={section.config}
                                    primaryColor={branding.colors?.primary}
                                />
                            )
                            break
                        case 'divider':
                            content = (
                                <DividerSection
                                    config={section.config}
                                />
                            )
                            break
                        default:
                            content = null
                    }
                    
                    if (!content) return null

                    const id = section.type === 'past_events' ? 'past-events' : section.type

                    // Do not wrap hero or divider with padding id divs
                    if (section.type === 'hero' || section.type === 'divider') {
                        return <div key={key}>{content}</div>
                    }

                    return (
                        <div key={key} id={id} className="scroll-mt-20">
                            {content}
                        </div>
                    )
                })}
        </>
    )
}
