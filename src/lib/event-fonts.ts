/**
 * The eight faces an organizer can pick for their event page.
 *
 * Lifted out of src/app/events/[id]/page.tsx, which held the only copy. The
 * embed widget now renders in the organizer's chosen font too, and a second
 * hand-maintained copy of this table would drift the moment anyone added a
 * face — the widget would silently fall back to Inter on a page set in Bebas,
 * which is exactly the mismatch the "match my event page" option exists to
 * remove.
 *
 * `url` is the Google Fonts stylesheet to load; Inter is already in the app's
 * base CSS, so its url is empty and callers must filter falsy entries.
 */
export interface FontChoice {
    name: string
    url: string
    css: string
}

export const FONT_MAP: Record<string, FontChoice> = {
    inter:      { name: 'Inter',              url: '',                                                                                           css: 'Inter, sans-serif' },
    playfair:   { name: 'Playfair Display',   url: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&display=swap',    css: "'Playfair Display', serif" },
    grotesk:    { name: 'Space Grotesk',      url: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=swap',       css: "'Space Grotesk', sans-serif" },
    bebas:      { name: 'Bebas Neue',         url: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap',                           css: "'Bebas Neue', cursive" },
    cormorant:  { name: 'Cormorant Garamond', url: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&display=swap',  css: "'Cormorant Garamond', serif" },
    mono:       { name: 'JetBrains Mono',     url: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap',          css: "'JetBrains Mono', monospace" },
    outfit:     { name: 'Outfit',             url: 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;900&display=swap',          css: "'Outfit', sans-serif" },
    dmserif:    { name: 'DM Serif Display',   url: 'https://fonts.googleapis.com/css2?family=DM+Serif+Display&display=swap',                     css: "'DM Serif Display', serif" },
}

/** Never throws and never returns undefined — an unknown id is Inter. */
export function resolveFont(id: string | null | undefined): FontChoice {
    return (id && FONT_MAP[id]) || FONT_MAP.inter
}
