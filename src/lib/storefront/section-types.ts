// Section type definitions for the storefront page builder
export type SectionType = 'hero' | 'about' | 'events' | 'past_events' | 'gallery' | 'newsletter' | 'stats' | 'cta' | 'divider'

export interface StorefrontSection {
    type: SectionType
    visible: boolean
    config: Record<string, any>
}

// Section metadata for the editor
export const SECTION_META: Record<SectionType, { label: string; icon: string; description: string }> = {
    hero: { label: 'Hero Section', icon: 'Image', description: 'Full-width hero with image, video, or overlay text' },
    about: { label: 'About', icon: 'FileText', description: 'Rich text description of your organization' },
    events: { label: 'Upcoming Events', icon: 'Calendar', description: 'Grid or list of your upcoming events' },
    past_events: { label: 'Past Events', icon: 'History', description: 'Showcase your previously hosted events' },
    gallery: { label: 'Photo Gallery', icon: 'GalleryHorizontal', description: 'Image gallery grid or masonry layout' },
    newsletter: { label: 'Newsletter Signup', icon: 'Mail', description: 'Email subscribe form for your audience' },
    stats: { label: 'Stats & Numbers', icon: 'BarChart3', description: 'Highlight key numbers and achievements' },
    cta: { label: 'Call to Action', icon: 'Megaphone', description: 'Full-width banner with a call to action' },
    divider: { label: 'Divider', icon: 'Minus', description: 'Visual separator between sections' },
}

// Default configs per section type
export const DEFAULT_SECTION_CONFIG: Record<SectionType, Record<string, any>> = {
    hero: { variant: 'fullbleed', overlay_text: '', cta_text: '', cta_link: '', height: 'default' },
    about: { variant: 'centered' },
    events: { variant: 'grid', columns: 3, show_price: true, show_category: true },
    past_events: { variant: 'grid', columns: 2 },
    gallery: { variant: 'grid', columns: 3, images: [] },
    newsletter: { variant: 'banner', heading: 'Stay in the loop', subheading: 'Get notified about upcoming events' },
    stats: { items: [{ label: 'Events Hosted', value: '10+' }, { label: 'Happy Attendees', value: '1,000+' }] },
    cta: { heading: '', subheading: '', button_text: 'Learn More', button_link: '', background_color: '' },
    divider: { style: 'line' },
}

// Template presets
export type TemplateName = 'modern' | 'classic' | 'minimal' | 'bold'

export const TEMPLATE_META: Record<TemplateName, { label: string; description: string }> = {
    modern: { label: 'Modern Split', description: 'Sidebar brand card + content grid. Best for info-dense organizers.' },
    classic: { label: 'Classic Hero', description: 'Big hero image with centered branding. Traditional and impactful.' },

    minimal: { label: 'Minimal', description: 'Clean white space, text-focused. Premium and elegant.' },
    bold: { label: 'Bold', description: 'Dark, full-bleed hero with stats. Perfect for nightlife and festivals.' },
}

export function getTemplateSections(template: TemplateName): StorefrontSection[] {
    switch (template) {
        case 'modern':
            return [
                { type: 'hero', visible: true, config: { variant: 'split', height: 'default' } },
                { type: 'about', visible: true, config: { variant: 'left-aligned' } },
                { type: 'events', visible: true, config: { variant: 'grid', columns: 3 } },
                { type: 'newsletter', visible: true, config: { variant: 'inline', heading: 'Stay updated', subheading: 'Never miss an event' } },
            ]
        case 'classic':
            return [
                { type: 'hero', visible: true, config: { variant: 'fullbleed', height: 'tall' } },
                { type: 'about', visible: true, config: { variant: 'centered' } },
                { type: 'events', visible: true, config: { variant: 'grid', columns: 3 } },
                { type: 'past_events', visible: true, config: { variant: 'grid', columns: 3 } },
            ]

        case 'minimal':
            return [
                { type: 'hero', visible: true, config: { variant: 'minimal', height: 'short' } },
                { type: 'about', visible: true, config: { variant: 'centered' } },
                { type: 'events', visible: true, config: { variant: 'grid', columns: 3 } },
                { type: 'divider', visible: true, config: { style: 'line' } },
                { type: 'cta', visible: true, config: { heading: 'Ready to join?', subheading: 'Browse our upcoming events and grab your tickets.', button_text: 'View All Events', button_link: '#events' } },
            ]
        case 'bold':
            return [
                { type: 'hero', visible: true, config: { variant: 'fullbleed', height: 'tall', overlay_text: '', cta_text: 'See Events', cta_link: '#events' } },
                { type: 'stats', visible: true, config: { items: [{ label: 'Events', value: '50+' }, { label: 'Attendees', value: '10K+' }, { label: 'Cities', value: '5' }] } },
                { type: 'events', visible: true, config: { variant: 'grid', columns: 3 } },
                { type: 'cta', visible: true, config: { heading: "Don't miss out", subheading: 'Follow us for the next big event', button_text: 'Follow', button_link: '#newsletter' } },
            ]
    }
}
