/**
 * Curated event-page design templates — one per art-directed THEME.
 *
 * Each template bundles a theme id (drives the injected component CSS in
 * event-themes.ts: cards, badges, buttons, section headers, hero type) with
 * the matching knobs (background, layout, fonts, colors, engagement toggles).
 * Applying one fills the storefront-customization form; the organizer can
 * still tweak every knob afterwards — including the brand color, which the
 * theme CSS follows via --hh-accent.
 *
 * Deliberately excluded (content, not look): section order/hidden, video,
 * bg_image_url, description_html.
 */

import type { EventThemeId } from '@/lib/event-themes'

export type EventDesignTemplate = {
    id: string
    name: string
    tagline: string
    /** Small chip shown on the card, e.g. the kind of event it suits */
    vibe: string
    /** Art-directed theme applied to the public page (layout_config.theme) */
    theme: EventThemeId
    theme_color: string
    bg_style: 'default' | 'particles' | 'gradient-mesh' | 'noise' | 'parallax' | 'cover-blur'
    page_layout: 'default' | 'poster' | 'minimal' | 'broadside' | 'editorial' | 'cinematic' | 'boutique'
    font_heading: string
    font_body: string
    heading_color: string | null
    text_color: string | null
    show_countdown: boolean
    show_social_proof: boolean
}

export const EVENT_DESIGN_TEMPLATES: EventDesignTemplate[] = [
    {
        id: 'classic',
        name: 'HangHut Classic',
        tagline: 'Clean, bright, gets out of the way',
        vibe: 'Any event',
        theme: 'classic',
        theme_color: '#4E47DC',
        bg_style: 'default',
        page_layout: 'default',
        font_heading: 'inter',
        font_body: 'inter',
        heading_color: null,
        text_color: null,
        show_countdown: false,
        show_social_proof: false,
    },
    {
        id: 'neon-rave',
        name: 'Neon Rave',
        tagline: 'Glowing type, electric borders, full-screen poster',
        vibe: 'Raves & club nights',
        theme: 'neon-rave',
        theme_color: '#D946EF',
        bg_style: 'gradient-mesh',
        page_layout: 'poster',
        font_heading: 'bebas',
        font_body: 'grotesk',
        heading_color: '#FFFFFF',
        text_color: null,
        show_countdown: true,
        show_social_proof: true,
    },
    {
        id: 'velvet-gala',
        name: 'Velvet Gala',
        tagline: 'Hairline gold frames, engraved serif restraint',
        vibe: 'Galas & formal dinners',
        theme: 'velvet-gala',
        theme_color: '#D4AF37',
        bg_style: 'noise',
        page_layout: 'default',
        font_heading: 'cormorant',
        font_body: 'inter',
        heading_color: '#F5EFE0',
        text_color: null,
        show_countdown: false,
        show_social_proof: false,
    },
    {
        id: 'sunset-festival',
        name: 'Sunset Festival',
        tagline: 'Sticker badges, chunky rounds, wavy underlines',
        vibe: 'Festivals & outdoor',
        theme: 'sunset-festival',
        theme_color: '#F97316',
        bg_style: 'parallax',
        page_layout: 'default',
        font_heading: 'outfit',
        font_body: 'outfit',
        heading_color: null,
        text_color: null,
        show_countdown: true,
        show_social_proof: true,
    },
    {
        id: 'circuit',
        name: 'Circuit',
        tagline: 'Corner brackets, terminal labels, constellation sky',
        vibe: 'Tech & conferences',
        theme: 'circuit',
        theme_color: '#10B981',
        bg_style: 'particles',
        page_layout: 'default',
        font_heading: 'grotesk',
        font_body: 'inter',
        heading_color: '#FFFFFF',
        text_color: null,
        show_countdown: false,
        show_social_proof: false,
    },
    {
        id: 'spotlight',
        name: 'Spotlight',
        tagline: 'Your poster becomes the whole atmosphere',
        vibe: 'Concerts & showcases',
        theme: 'classic',
        theme_color: '#8B5CF6',
        bg_style: 'cover-blur',
        page_layout: 'default',
        font_heading: 'playfair',
        font_body: 'inter',
        heading_color: '#FFFFFF',
        text_color: null,
        show_countdown: true,
        show_social_proof: true,
    },
    {
        id: 'fiesta',
        name: 'Fiesta',
        tagline: 'Banderitas, bright stickers, street-party energy',
        vibe: 'Fiestas & food fests',
        theme: 'fiesta',
        theme_color: '#E11D48',
        bg_style: 'default',
        page_layout: 'default',
        font_heading: 'outfit',
        font_body: 'inter',
        heading_color: null,
        text_color: null,
        show_countdown: true,
        show_social_proof: true,
    },
    {
        id: 'broadsheet',
        name: 'Broadsheet',
        tagline: 'Print rules, numbered sections, serif headlines',
        vibe: 'Talks & workshops',
        theme: 'broadsheet',
        theme_color: '#18181B',
        bg_style: 'default',
        page_layout: 'minimal',
        font_heading: 'dmserif',
        font_body: 'inter',
        heading_color: null,
        text_color: null,
        show_countdown: false,
        show_social_proof: false,
    },
    // ── New "bones" layouts (event-layouts.ts). These change the page's whole
    //    composition, not just its paint — the fix for "templates all look the
    //    same in different colours". Each pairs its skeleton with a theme that
    //    complements it (no card chrome the layout would strip). ──────────────
    {
        id: 'broadside',
        name: 'Broadside',
        tagline: 'No cards. Giant condensed type. A gig poster, not a webpage.',
        vibe: 'Concerts & club nights',
        theme: 'classic',
        theme_color: '#F5333F',
        bg_style: 'default',
        page_layout: 'broadside',
        font_heading: 'bebas',
        font_body: 'grotesk',
        heading_color: null,
        text_color: null,
        show_countdown: false,
        show_social_proof: true,
    },
    {
        id: 'editorial',
        name: 'Editorial',
        tagline: 'A magazine spread — poster beside the story, hairline rules',
        vibe: 'Galas, art & dinners',
        theme: 'classic',
        theme_color: '#1E3A8A',
        bg_style: 'default',
        page_layout: 'editorial',
        font_heading: 'playfair',
        font_body: 'inter',
        heading_color: null,
        text_color: null,
        show_countdown: false,
        show_social_proof: false,
    },
    {
        id: 'cinematic',
        name: 'Cinematic',
        tagline: 'Your poster fills the screen; details float in glass',
        vibe: 'Premieres & showcases',
        theme: 'classic',
        theme_color: '#8B5CF6',
        bg_style: 'cover-blur',
        page_layout: 'cinematic',
        font_heading: 'playfair',
        font_body: 'inter',
        heading_color: '#FFFFFF',
        text_color: null,
        show_countdown: true,
        show_social_proof: true,
    },
    {
        id: 'boutique',
        name: 'Boutique',
        tagline: 'A centered invitation — serif, whitespace, quiet luxury',
        vibe: 'Weddings & intimate',
        theme: 'classic',
        theme_color: '#B98A5E',
        bg_style: 'default',
        page_layout: 'boutique',
        font_heading: 'cormorant',
        font_body: 'inter',
        heading_color: null,
        text_color: null,
        show_countdown: false,
        show_social_proof: false,
    },
]

/** CSS font stacks per font key — mirrors FONT_MAP on the public event page */
export const TEMPLATE_FONT_CSS: Record<string, string> = {
    inter: 'Inter, sans-serif',
    playfair: "'Playfair Display', serif",
    grotesk: "'Space Grotesk', sans-serif",
    bebas: "'Bebas Neue', cursive",
    cormorant: "'Cormorant Garamond', serif",
    mono: "'JetBrains Mono', monospace",
    outfit: "'Outfit', sans-serif",
    dmserif: "'DM Serif Display', serif",
}

/** One stylesheet that loads every face the gallery previews need */
export const TEMPLATE_FONTS_URL =
    'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Bebas+Neue&family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@600;900&family=DM+Serif+Display&family=Playfair+Display:wght@700&display=swap'
