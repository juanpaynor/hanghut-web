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

                    switch (section.type) {
                        case 'hero':
                            return (
                                <HeroSection
                                    key={key}
                                    config={section.config}
                                    partner={partner}
                                    branding={branding}
                                />
                            )
                        case 'about':
                            return (
                                <AboutSection
                                    key={key}
                                    config={section.config}
                                    description={partner.description}
                                    descriptionHtml={branding.description_html}
                                />
                            )
                        case 'events':
                            return (
                                <EventsSection
                                    key={key}
                                    config={section.config}
                                    events={events}
                                    sortBy={branding.content?.sort_by}
                                />
                            )
                        case 'past_events':
                            return (
                                <PastEventsSection
                                    key={key}
                                    config={section.config}
                                    events={pastEvents}
                                />
                            )
                        case 'newsletter':
                            return (
                                <NewsletterSection
                                    key={key}
                                    config={section.config}
                                    partnerId={partner.id}
                                    partnerName={partner.business_name}
                                />
                            )
                        case 'stats':
                            return (
                                <StatsSection
                                    key={key}
                                    config={section.config}
                                />
                            )
                        case 'cta':
                            return (
                                <CTASection
                                    key={key}
                                    config={section.config}
                                    primaryColor={branding.colors?.primary}
                                />
                            )
                        case 'divider':
                            return (
                                <DividerSection
                                    key={key}
                                    config={section.config}
                                />
                            )
                        default:
                            return null
                    }
                })}
        </>
    )
}
