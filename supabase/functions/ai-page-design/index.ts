import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
// Pinned: the floating `@2` specifier resolves to a build that 404s on esm.sh
// and blocks every edge deploy. Do not loosen this.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.0'

/**
 * ============================================================================
 * AI PAGE DESIGN — writes the Custom CSS / Rich Content an organizer can't
 * ============================================================================
 * Two modes, one function:
 *   mode: 'css'  → a stylesheet for the public event page
 *   mode: 'html' → a block of content for the About section
 *
 * The hard part is not the prose, it's the CONTRACT. Both outputs are filtered
 * before they ever render — CSS through sanitizeCustomCss (every selector is
 * rewritten to sit under [data-hh-theme], @import dropped) and HTML through
 * sanitize-html (a fixed tag/attribute/style allowlist). A model that invents a
 * selector or reaches for `position: absolute` produces something that is
 * accepted, saved, and then does NOTHING on the page — which to the organizer
 * is indistinguishable from the feature being broken. So both prompts below
 * restate the real hooks and the real allowlist, and they must be kept in step
 * with src/lib/design-code-library.ts and src/lib/sanitize.ts.
 *
 * Auth-gated. Pure generation — never writes to the event.
 * ============================================================================
 */

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')
const GROQ_MODEL = Deno.env.get('GROQ_MODEL') || ''

/** Same resilience as ai-marketing-copy: our key's model access has changed
 *  under us twice, so never hardcode a single name. */
const MODEL_PREFERENCE = [
    'openai/gpt-oss-120b',
    'llama-3.3-70b-versatile',
    'openai/gpt-oss-20b',
    'llama-3.1-8b-instant',
]
const NOT_CHAT = /whisper|tts|guard|embed|vision-preview|playai/i

async function availableChatModels(): Promise<string[]> {
    try {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
            headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
        })
        if (!res.ok) return []
        const body = await res.json()
        const ids: string[] = (body?.data ?? [])
            .map((m: { id?: string }) => m?.id)
            .filter((id: unknown): id is string => typeof id === 'string' && !NOT_CHAT.test(id))
        return [
            ...MODEL_PREFERENCE.filter(m => ids.includes(m)),
            ...ids.filter(id => !MODEL_PREFERENCE.includes(id)),
        ]
    } catch {
        return []
    }
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
}

function parseJson(text: string): Record<string, unknown> {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
    return JSON.parse((fenced ? fenced[1] : text).trim())
}

/** Models like to wrap code in fences even when told not to. Strip them rather
 *  than handing the organizer a stylesheet that starts with ```css. */
function unfence(code: string): string {
    const m = code.match(/^\s*```[a-z]*\s*\n([\s\S]*?)\n?```\s*$/i)
    return (m ? m[1] : code).trim()
}

const CSS_SYSTEM = `You write CSS skins for event pages on HangHut, a Philippine ticketing platform. The organizer describes a look; you return the stylesheet.

Return ONLY a single JSON object, no markdown and no commentary:
{
  "code": string,   // the CSS, ready to paste
  "notes": string   // ONE short sentence, plain English, telling the organizer what changed. No CSS jargon.
}

THESE ARE THE ONLY HOOKS THAT EXIST ON THE PAGE. A selector that is not built from them matches nothing and your work is invisible:
- [data-hh-event]          the whole page (use for page background / default text colour)
- [data-hh-title]          the big event title
- [data-hh-section-title]  section headings ("About this Event", "Event Gallery", …)
- [data-hh-card]           panels: date/venue box, organizer card, ticket box
- [data-hh-badge]          small chips: event type, Featured, tier labels
- [data-hh-event] button   every button, including Proceed to Checkout
- [data-hh-event] a        links
- [data-hh-event] img      poster, gallery photos, avatar
- [data-hh-event] p, [data-hh-event] li, [data-hh-event] h1, [data-hh-event] h2, [data-hh-event] h3, [data-hh-event] h4
- [data-hh-event] #tickets the ticket panel; use #tickets button to change checkout buttons only
- [data-hh-poster]        the cover image ONLY (not avatars or gallery shots)
- [data-hh-tier]          one selectable ticket card. The chosen one is [data-hh-tier][aria-pressed="true"]; [data-hh-tier-state="sold-out" | "locked" | "selected" | "available"] is also available
- [data-hh-price]         every price, including the order total
- [data-hh-total]         the Total row under the tickets
- [data-hh-qty]           the quantity number between the minus and plus buttons
- [data-hh-cta]           the Proceed to Checkout button ONLY
- [data-hh-seatmap]       seated events: the panel around the seat map
- [data-hh-seat-summary]  seated events: the "2 seats, total, Continue" bar
- [data-hh-mixed-panel]   events selling BOTH general admission and seats; its halves are [data-hh-mixed-part="ga"] and [data-hh-mixed-part="seated"]

A SEAT MAP IS A CANVAS. The seats, sections and stage are drawn with Konva, and their colours come from the event's tier palette and each seat's status. NO stylesheet can repaint them, so never claim to have recoloured seats. Style the panel, the summary bar and the buttons around the map instead.
- [data-hh-event] [data-hh-surface="light"] or [data-hh-event] [data-hh-surface="dark"] content panels with their own light/dark ground

PAGE STRUCTURE AND CASCADE:
- [data-hh-event] and [data-hh-theme] are attributes on the SAME root element. To combine them, write [data-hh-theme][data-hh-event], never [data-hh-theme] [data-hh-event].
- The server adds the [data-hh-theme] scope for you. Rules starting with [data-hh-event] keep targeting that root correctly.
- This is an existing page, not an empty canvas. Its layout controls structure; your stylesheet changes its appearance. Do not invent wrappers, classes, sections, or new HTML.
- Built-in styles load in this order: base styles, theme, layout, organizer colour picks, then your custom CSS. A later rule still loses to a more specific selector or !important.
- Some elements set their own text colour: changing only the root's inherited colour will not repaint every child. Target the requested title/heading/text element explicitly.
- A dark hero can coexist with a LIGHT content panel. Preserve readable text on each surface; do not force every paragraph or card to white text while leaving light surfaces behind it.
- A background image or decorative background may cover the root's background colour. Do not claim to replace an image or restructure the page using an imaginary selector.

VARIABLES THE PAGE ALREADY SETS — prefer these over hardcoded values so the skin follows the organizer's own colour and font pickers:
- var(--hh-accent)      their brand colour
- var(--font-heading)   their heading font
- var(--font-body)      their body font

RULES:
- Use CURRENT DESIGN SETTINGS as the source of truth, including unsaved picks. Respect the selected layout, theme and fonts unless the request explicitly asks to override their appearance.
- When existing CSS is supplied, make the smallest edit that satisfies the request and preserve every unrelated rule, media query, animation, and comment. Return the COMPLETE stylesheet, not a fragment or diff. Do not append a second conflicting copy of a rule: edit that rule.
- Distinguish a narrow request ("gold headings") from a whole-page redesign ("dark and moody"). A narrow request must not replace backgrounds, fonts, image crops, spacing, or button shapes.
- Scope EVERY selector under one of the hooks above. Never write bare \`body\`, \`html\`, \`:root\`, \`header\`, \`.card\` or a Tailwind class name.
- YOU MAY IMPORT GOOGLE FONTS, and for a distinctive look you usually should. Write the @import as the FIRST line: @import url('https://fonts.googleapis.com/css2?family=Anton&display=swap'); The page extracts that URL and loads it as a real stylesheet link, so it works. fonts.googleapis.com is the ONLY host allowed — an import from anywhere else is silently dropped and your font will not load. Keep it to one or two families, and always give a fallback in the font stack. If the organizer has clearly chosen fonts in their pickers and the brief does not ask for a new look, prefer var(--font-heading) and var(--font-body) instead.
- A display face used only for the title and section headings is the cheapest way to make a page look art-directed rather than templated. Body text should stay in something readable.
- Use !important only where you are overriding a built-in style (colours, radii and backgrounds on buttons, cards and badges usually need it).
- Size the answer to the ask. A narrow request is a few lines. A whole-page skin is typically 60-120 lines, because a real skin has to move background, type, headings, cards and buttons together. When editing a longer existing stylesheet, preserving unrelated work takes priority over any budget.
- Readability is not optional: never put text on a background it cannot be read against, and never set a text colour without also controlling the surface behind it.
- Never hide the ticket box, the price, the buy button or the event date. The page exists to sell tickets.
- Comment each block with one short line so the organizer can learn from it and edit it later.
- Mobile matters more than desktop here; avoid fixed widths, oversized text, overflow, and fixed heights that clip content. Use clamp() for large titles and media queries when needed.

DESIGN QUALITY. The rules above stop you breaking the page; these are what make the result look designed rather than merely valid.

- START FROM THE POSTER. When THE POSTER'S ACTUAL COLOURS are supplied, they are the palette. Build the skin from those measured values instead of inventing colours, and instead of defaulting to the organizer's accent when the poster disagrees with it. A page that matches the poster is the single biggest difference between a page that looks made for this event and one that looks like a template. If no palette is supplied, use var(--hh-accent).
- COMMIT. A whole-page request ("dark and moody", "retro", "make it feel premium") means the page background, the title, the section headings, the cards and the buttons all move together. Changing only the heading colour and calling it a redesign is the most common way this feature disappoints.
- ONE ACCENT, USED TWO OR THREE TIMES. Pick a single colour to carry emphasis and spend it on the title, the buy button and one more place. An accent on everything is an accent on nothing.
- TYPE IS THE DESIGN, NOT JUST THE COLOUR. Give the title a real scale with clamp(), pull its line-height down near 1.0-1.1 so a big title reads as one shape, tighten its letter-spacing slightly, and give small uppercase labels positive letter-spacing. Most pages that look cheap look cheap because every piece of text is the same size and weight.
- SURFACES BEFORE TEXT COLOUR. Decide what each panel sits on, then choose text to suit it. Never set a text colour without setting the background behind it in the same block.
- CONTRAST IS A HARD FLOOR. Body text must stay clearly legible against its own surface. If the poster's colours are too close to each other to do this, darken or lighten one of them rather than shipping grey-on-grey.
- RHYTHM. Use a consistent spacing step and a consistent corner radius, and let one element break the pattern on purpose. Mixed arbitrary paddings read as an accident.
- DEPTH SPARINGLY. A soft shadow or a hairline border on the ticket panel earns attention. The same shadow on every card flattens the page again.
- AVOID THE DEFAULT AI LOOK. Do not reach for pure #000000 on pure #ffffff, a purple-to-blue gradient, a 12px radius on absolutely everything, or neon-on-near-black unless the brief or the poster actually asks for it.

WORKING EXAMPLES (patterns to adapt, not rules to add to every response):
NARROW REQUESTS stay narrow:
- "Gold headings only": [data-hh-title], [data-hh-section-title] { color: #d4af37 !important; }
- "Softer checkout buttons": [data-hh-event] #tickets button { border-radius: 999px !important; }
- "Bigger title": [data-hh-title] { font-size: clamp(2rem, 7vw, 5rem); line-height: 1.05; }
- "Now make those headings blue" with existing gold headings: change their colour and keep all other existing rules.

A WHOLE-PAGE SKIN looks like this. It imports one display face, defines its palette as tokens once, then moves ground, type, poster, ticket cards, price and the buy button together. This is the standard to aim at:
@import url('https://fonts.googleapis.com/css2?family=Anton&display=swap');
/* Palette lifted from the poster, named once so it is easy to retune */
[data-hh-event] { --skin-ink: #111111; --skin-accent: #e7a91c; --skin-paper: #f3f0e8; }
/* Ground */
[data-hh-event] { background: var(--skin-paper) !important; color: var(--skin-ink) !important; }
/* Display face on the title only, with a hard offset shadow in the accent */
[data-hh-title] { font-family: 'Anton', Impact, sans-serif !important; font-size: clamp(2rem, 7vw, 5rem); line-height: 1.05; letter-spacing: -0.02em; text-transform: uppercase; color: var(--skin-ink) !important; text-shadow: 3px 3px 0 var(--skin-accent); }
[data-hh-section-title] { font-family: 'Anton', Impact, sans-serif !important; text-transform: uppercase; letter-spacing: 0.01em; }
/* Poster framed rather than floating */
[data-hh-poster] { border: 2px solid var(--skin-ink) !important; box-shadow: 7px 7px 0 var(--skin-accent) !important; }
/* Cards and ticket tiers share one border and radius language */
[data-hh-card], [data-hh-tier] { background: #fffefa !important; color: var(--skin-ink) !important; border: 2px solid #c9c3b7 !important; border-radius: 6px !important; }
/* The chosen tier is unmistakable. aria-pressed already carries the state */
[data-hh-tier][aria-pressed="true"] { border-color: var(--skin-ink) !important; background: #fff6df !important; box-shadow: 5px 5px 0 var(--skin-accent) !important; }
[data-hh-tier-state="sold-out"] { opacity: 0.55; }
/* Price in the display face so it reads as part of the identity */
[data-hh-price] { font-family: 'Anton', Impact, sans-serif !important; letter-spacing: -0.01em; }
/* One element allowed to shout */
[data-hh-cta] { background: var(--skin-accent) !important; color: var(--skin-ink) !important; border: 2px solid var(--skin-ink) !important; border-radius: 4px !important; text-transform: uppercase; letter-spacing: 0.03em; font-weight: 800; box-shadow: 4px 4px 0 var(--skin-ink) !important; }
/* Light panels keep dark text rather than inheriting a pale ground */
[data-hh-event] [data-hh-surface="light"] { color: var(--skin-ink) !important; }
/* Phones get a smaller title and a shallower shadow */
@media (max-width: 640px) { [data-hh-title] { text-shadow: 2px 2px 0 var(--skin-accent); } }

BEFORE RETURNING: check that every selector uses a real hook, every requested change is represented, unrelated existing styles survive, and both mobile and light/dark panels remain readable. Notes must describe only the change you made, never promise a screenshot-verified result.`

/**
 * The brand page at /<slug> is a DIFFERENT document from the event page: its
 * root is [data-hh-storefront], it has no tickets, and its sections are named.
 * Handing it the event hook list produced selectors that matched nothing, which
 * an organizer reads as "the AI is broken" rather than "wrong page".
 */
const STOREFRONT_HOOKS = `

YOU ARE STYLING THE BRAND PAGE (/<slug>), NOT AN EVENT PAGE. IGNORE every hook named above and use ONLY these. There is no ticket box, no tier, no checkout button on this page:
- [data-hh-storefront]        the whole page (background, default text colour)
- [data-hh-hero]              the banner block at the top
- [data-hh-title]             the brand name in the hero
- [data-hh-section]           any section. Target one by name: [data-hh-section="events"]. Names are hero, about, events, past-events, stats, badges, cta, gallery, merch, newsletter, divider
- [data-hh-eyebrow]           the small uppercase label above a section heading
- [data-hh-section-title]     section headings
- [data-hh-section-desc]      the line under a section heading
- [data-hh-event-card]        one event tile in the listing
- [data-hh-price]             the price chip on an event card
- [data-hh-card]              generic panels, including the call-to-action box
- [data-hh-signup]            the newsletter form row
- [data-hh-divider]           the divider between sections; ="line", ="dots" or ="space"
- [data-hh-storefront] button / a / img / p / h1 / h2 / h3

Scope EVERY selector under one of these. [data-hh-event], [data-hh-tier], [data-hh-cta] and #tickets DO NOT EXIST here.
Giving each section its own treatment is the point of this page: a brand page where every section looks identical is the thing organizers complain about. Vary ground, spacing and heading weight between [data-hh-section="events"] and the quieter ones.
`

const HTML_SYSTEM = `You write the "About this event" content block for event pages on HangHut, a Philippine ticketing platform. The organizer describes their event; you return finished HTML.

Return ONLY a single JSON object, no markdown and no commentary:
{
  "code": string,   // the HTML, ready to paste
  "notes": string   // ONE short sentence, plain English, saying what you wrote. No jargon.
}

THE PAGE FILTERS THIS HTML BEFORE SHOWING IT. Anything outside the list below is silently deleted, which looks to the organizer like the feature is broken — so stay inside it:
- Tags: p, h1-h6, ul, ol, li, strong, em, a, br, hr, span, div, blockquote, table, tr, td, th, img, figure, figcaption, details, summary, section, iframe
- Style only via a style="..." attribute on the tag. There is NO <style> block and NO class names that mean anything.
- Allowed style properties include: color, background-color, background, font-size, font-weight, font-style, font-family, line-height, letter-spacing, text-align, text-decoration, padding, margin, border, border-radius, width, max-width, height, display, grid-template-columns, gap, align-items, justify-content, aspect-ratio, overflow, object-fit.
- NOT allowed, will be stripped: position, float, transform, cursor, border-collapse, z-index, animation. Never rely on them. For a responsive video box use aspect-ratio:16/9, never padding-bottom percentages.
- iframes only from youtube.com/embed, youtube-nocookie.com, player.vimeo.com, or google.com/maps.
- No forms, no scripts, no buttons that submit anything.

RULES:
- Write real, usable copy from the brief — never lorem ipsum, never bracketed placeholders unless the organizer must fill in a specific unknown (then make it obvious, like VIDEO_ID).
- NEVER invent facts the brief does not give you: no made-up dates, prices, addresses, lineups or guarantees.
- Match the brief's language — English, Tagalog or Taglish.
- Keep it skimmable: short paragraphs, a list where a list helps, a heading every few blocks. Most people read this on a phone.
- Do not restate the title, date, venue or ticket price — the page already shows those above this block.
- Use colour sparingly and never set a text colour that could clash with a dark page background; prefer leaving text colour alone.`

function fmtDate(iso?: string | null): string {
    if (!iso) return ''
    try {
        return new Intl.DateTimeFormat('en-PH', {
            timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        }).format(new Date(iso))
    } catch { return '' }
}

/** Only bounded design values belong in the prompt, never the full layout
 * document (which can include content, URLs and large arrays). */
const DESIGN_KEYS = [
    'theme', 'page_layout', 'bg_style', 'content_panel', 'font_heading',
    'font_body', 'theme_color', 'text_color', 'heading_color', 'has_background_image',
] as const

const HEX_RE = /^#[0-9a-f]{6}$/i

/**
 * The poster palette, sanitised.
 *
 * This arrives from the browser and goes STRAIGHT INTO A PROMPT, so every
 * field is validated rather than trusted: anything that is not a 6-digit hex
 * is dropped. Without this, "vibrant" is an arbitrary string an organizer's
 * client could set, and prompt text is the one place where arbitrary strings
 * are most expensive to be wrong about.
 *
 * Returns '' when there is nothing usable, so the caller can simply skip the
 * whole section instead of telling the model about a palette of nothing.
 */
function paletteLine(value: unknown): string {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
    const p = value as Record<string, unknown>
    const hex = (v: unknown) => (typeof v === 'string' && HEX_RE.test(v) ? v.toLowerCase() : '')
    const vibrant = hex(p.vibrant), dark = hex(p.dark), light = hex(p.light)
    if (!vibrant && !dark && !light) return ''
    const swatches = Array.isArray(p.swatches)
        ? p.swatches.filter((c): c is string => typeof c === 'string' && HEX_RE.test(c)).slice(0, 5).map(c => c.toLowerCase())
        : []
    const bits = [
        vibrant ? `strongest colour ${vibrant}` : '',
        dark ? `darkest ${dark}` : '',
        light ? `lightest ${light}` : '',
        swatches.length ? `most of the poster is ${swatches.join(', ')}` : '',
        typeof p.isDark === 'boolean' ? (p.isDark ? 'the poster is mostly DARK' : 'the poster is mostly LIGHT') : '',
    ].filter(Boolean)
    return `\n\nTHE POSTER'S ACTUAL COLOURS (sampled from the event's own cover image — these are real measurements, not guesses):\n- ${bits.join('\n- ')}`
}

function designValues(value: unknown): Record<string, string | boolean> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const input = value as Record<string, unknown>
    const out: Record<string, string | boolean> = {}
    for (const key of DESIGN_KEYS) {
        const v = input[key]
        if (typeof v === 'string') out[key] = v.slice(0, 80)
        else if (typeof v === 'boolean') out[key] = v
    }
    return out
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        if (!GROQ_API_KEY) return json({ error: 'The AI assistant is not configured on our side.' }, 500)

        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
        const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
        const authHeader = req.headers.get('Authorization') ?? ''
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } },
        })
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return json({ error: 'Unauthorized' }, 401)

        const { mode, surface, brief, event_id, current, design } = await req.json() as {
            mode?: string
            surface?: string
            brief?: string
            event_id?: string
            /** What is already in the box, so "make it darker" has something to
             *  work from instead of starting over. Capped — this is a prompt. */
            current?: string
            design?: unknown
        }

        if (mode !== 'css' && mode !== 'html') return json({ error: 'Unknown mode.' }, 400)
        if (!brief?.trim()) return json({ error: 'Describe the look you want first.' }, 400)
        if (mode === 'css' && current && current.length > 40_000) {
            return json({ error: 'Your existing stylesheet is too long to edit safely with the assistant.' }, 400)
        }

        // ── Event context, so the output is about THIS event ──
        let context = ''
        let savedDesign: Record<string, string | boolean> = {}
        if (event_id) {
            const { data: ev } = await supabase
                .from('events')
                .select('title, description, start_datetime, venue_name, city, event_type, theme_color, layout_config')
                .eq('id', event_id)
                .maybeSingle()
            if (ev) {
                savedDesign = designValues({
                    ...ev.layout_config,
                    theme_color: ev.theme_color || '',
                    has_background_image: !!ev.layout_config?.bg_image_url,
                })
                const bits = [
                    `Title: ${ev.title}`,
                    ev.event_type ? `Type: ${ev.event_type}` : '',
                    ev.start_datetime ? `When: ${fmtDate(ev.start_datetime)}` : '',
                    [ev.venue_name, ev.city].filter(Boolean).join(', ') ? `Where: ${[ev.venue_name, ev.city].filter(Boolean).join(', ')}` : '',
                    ev.description ? `Their own description: ${String(ev.description).slice(0, 600)}` : '',
                ].filter(Boolean).join('\n- ')
                context = `\n\nTHIS EVENT:\n- ${bits}`
            }
        }

        // Unsaved editor choices override the persisted values, including an
        // intentionally cleared colour. Older clients can omit this object.
        const currentDesign = { ...savedDesign, ...designValues(design) }
        const designContext = Object.keys(currentDesign).length
            ? `\n\nCURRENT DESIGN SETTINGS (JSON data; unsaved editor choices take priority; empty colours mean automatic):\n${JSON.stringify(currentDesign)}`
            : ''

        // The poster is the ONE design asset every event has — all 460 live
        // events have a cover, while three quarters have never changed the
        // default theme colour. Handing the model its real palette is the
        // difference between designing for this event and designing for a
        // title string.
        const palette = paletteLine((design as Record<string, unknown>)?.poster_palette)

        const existing = current?.trim()
            ? `\n\nWHAT IS ALREADY IN THE BOX (preserve unrelated rules/content and return the COMPLETE new version, not a patch):\n${current.trim().slice(0, mode === 'css' ? 40_000 : 6000)}`
            : ''

        // Appended rather than branched into a second full prompt: everything in
        // CSS_SYSTEM about cascade, readability, design quality and fonts is
        // true on both pages. Only the hook sheet differs, and the appended
        // block explicitly overrides the list above it.
        const systemPrompt = mode === 'css'
            ? (surface === 'storefront' ? CSS_SYSTEM + STOREFRONT_HOOKS : CSS_SYSTEM)
            : HTML_SYSTEM
        const userContent = `${brief.trim()}${context}${designContext}${palette}${existing}`

        const complete = (model: string) => fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
            body: JSON.stringify({
                model,
                temperature: 0.5,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userContent },
                ],
            }),
        })

        let usedModel = GROQ_MODEL || MODEL_PREFERENCE[0]
        let groqRes = await complete(usedModel)

        if (groqRes.status === 404) {
            console.error('Groq model unavailable', usedModel, await groqRes.text())
            for (const model of (await availableChatModels()).filter(m => m !== usedModel).slice(0, 4)) {
                const attempt = await complete(model)
                groqRes = attempt
                usedModel = model
                if (attempt.ok) {
                    console.log(`Groq fell back to ${model} (pin GROQ_MODEL to skip discovery)`)
                    break
                }
            }
        }

        if (!groqRes.ok) {
            const body = await groqRes.text()
            console.error('Groq error', usedModel, groqRes.status, body)
            return json({
                error: groqRes.status === 404
                    ? 'The AI assistant is not configured correctly on our side. We have been alerted — use a starter or a snippet for now.'
                    : groqRes.status === 429
                        ? 'The AI assistant is busy. Give it a minute and try again.'
                        : `AI error (${groqRes.status}). Please try again.`,
            }, 502)
        }

        const text = (await groqRes.json())?.choices?.[0]?.message?.content
        if (!text) return json({ error: 'The AI returned nothing. Try describing it differently.' }, 422)

        let out: Record<string, unknown>
        try {
            out = parseJson(text)
        } catch {
            return json({ error: 'AI returned an unexpected format. Please try again.' }, 502)
        }

        const code = unfence(typeof out.code === 'string' ? out.code : '')
        const notes = typeof out.notes === 'string' ? out.notes : ''
        if (!code) return json({ error: 'Could not build that. Add a bit more detail about the look you want.' }, 422)

        return json({ code, notes })
    } catch (err) {
        console.error('ai-page-design error', err)
        return json({ error: 'Something went wrong. Please try again.' }, 500)
    }
})
