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
- [data-hh-event] p, [data-hh-event] li, [data-hh-event] h1..h4

VARIABLES THE PAGE ALREADY SETS — prefer these over hardcoded values so the skin follows the organizer's own colour and font pickers:
- var(--hh-accent)      their brand colour
- var(--font-heading)   their heading font
- var(--font-body)      their body font

RULES:
- Scope EVERY selector under one of the hooks above. Never write bare \`body\`, \`html\`, \`:root\`, \`header\`, \`.card\` or a Tailwind class name.
- No @import and no web-font URLs; the font pickers handle fonts.
- Use !important only where you are overriding a built-in style (colours, radii and backgrounds on buttons, cards and badges usually need it).
- Keep it SHORT — under 60 lines. A tight skin that works beats a long one that fights the page.
- Readability is not optional: never put text on a background it cannot be read against, and never set a text colour without also controlling the surface behind it.
- Never hide the ticket box, the price, the buy button or the event date. The page exists to sell tickets.
- Comment each block with one short line so the organizer can learn from it and edit it later.
- Mobile matters more than desktop here; avoid fixed pixel widths.`

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

        const { mode, brief, event_id, current } = await req.json() as {
            mode?: string
            brief?: string
            event_id?: string
            /** What is already in the box, so "make it darker" has something to
             *  work from instead of starting over. Capped — this is a prompt. */
            current?: string
        }

        if (mode !== 'css' && mode !== 'html') return json({ error: 'Unknown mode.' }, 400)
        if (!brief?.trim()) return json({ error: 'Describe the look you want first.' }, 400)

        // ── Event context, so the output is about THIS event ──
        let context = ''
        if (event_id) {
            const { data: ev } = await supabase
                .from('events')
                .select('title, description, start_datetime, venue_name, city, event_type, theme_color')
                .eq('id', event_id)
                .maybeSingle()
            if (ev) {
                const bits = [
                    `Title: ${ev.title}`,
                    ev.event_type ? `Type: ${ev.event_type}` : '',
                    ev.start_datetime ? `When: ${fmtDate(ev.start_datetime)}` : '',
                    [ev.venue_name, ev.city].filter(Boolean).join(', ') ? `Where: ${[ev.venue_name, ev.city].filter(Boolean).join(', ')}` : '',
                    ev.theme_color ? `Their brand colour: ${ev.theme_color} (this is what var(--hh-accent) resolves to)` : '',
                    ev.description ? `Their own description: ${String(ev.description).slice(0, 600)}` : '',
                ].filter(Boolean).join('\n- ')
                context = `\n\nTHIS EVENT:\n- ${bits}`
            }
        }

        const existing = current?.trim()
            ? `\n\nWHAT IS ALREADY IN THE BOX (treat the request as an edit to this, and return the COMPLETE new version, not a patch):\n${current.trim().slice(0, 6000)}`
            : ''

        const systemPrompt = mode === 'css' ? CSS_SYSTEM : HTML_SYSTEM
        const userContent = `${brief.trim()}${context}${existing}`

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
