import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

/**
 * ============================================================================
 * AI MARKETING COPY — Groq-powered campaign copywriter
 * ============================================================================
 * From a short brief (+ optional tone + optional event), returns subject-line
 * options and an email-safe HTML body for the marketing composer. When an event
 * is chosen we also prepend its cover image as a hero (the model is blocked from
 * emitting <img>, so we add it ourselves, email-safe). Auth-gated. Pure
 * generation — never sends.
 * ============================================================================
 */

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')

/**
 * Model selection is RESILIENT, not hardcoded, because we have now been broken
 * twice by the same thing: Llama 4 Scout was a gated preview that 404'd for our
 * account, and its replacement `llama-3.3-70b-versatile` — still listed as a
 * production model in Groq's own docs — started answering
 * "does not exist or you do not have access to it" for OUR key. A model name
 * baked into the source is a time bomb on someone else's release schedule.
 *
 * So: try the preferred model, and if Groq says model_not_found, ask the key
 * what it CAN actually run and use the best of those. Set GROQ_MODEL to pin a
 * specific one and skip the discovery path.
 */
const GROQ_MODEL = Deno.env.get('GROQ_MODEL') || ''

/** Best-first. Anything the account offers that is not here is still tried
 *  afterwards, so a brand-new Groq model works without a redeploy.
 *
 *  gpt-oss-120b leads because it is what our key can actually run TODAY,
 *  verified against Groq's /models on 2026-09-20. Our account has no Llama
 *  access of any kind — not Scout, not 3.3, not 3.1 — which is why two
 *  successive Llama defaults both 404'd. The Llama entries stay below as
 *  fallbacks in case that access is ever added. */
const MODEL_PREFERENCE = [
    'openai/gpt-oss-120b',
    'llama-3.3-70b-versatile',
    'openai/gpt-oss-20b',
    'qwen/qwen3.8-27b',
    'llama-3.1-8b-instant',
]

/** Models that exist on the account but cannot do JSON chat completion. */
const NOT_CHAT = /whisper|tts|guard|embed|vision-preview|playai/i

async function availableChatModels(): Promise<string[]> {
    try {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
            headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
        })
        if (!res.ok) {
            console.error('Groq /models failed', res.status, await res.text())
            return []
        }
        const body = await res.json()
        const ids: string[] = (body?.data ?? [])
            .map((m: { id?: string }) => m?.id)
            .filter((id: unknown): id is string => typeof id === 'string' && !NOT_CHAT.test(id))
        // Preference order first, then whatever else the account has.
        const ranked = [
            ...MODEL_PREFERENCE.filter(m => ids.includes(m)),
            ...ids.filter(id => !MODEL_PREFERENCE.includes(id)),
        ]
        console.log('Groq models available to this key:', ids.join(', ') || '(none)')
        return ranked
    } catch (e) {
        console.error('Groq /models threw', e)
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

function esc(s: string): string {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

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
        if (!GROQ_API_KEY) return json({ error: 'GROQ_API_KEY not configured' }, 500)

        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
        const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

        const authHeader = req.headers.get('Authorization') ?? ''
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } },
        })
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return json({ error: 'Unauthorized' }, 401)

        const { brief, tone, event_id, business_name } = await req.json() as {
            brief?: string
            tone?: string
            event_id?: string
            business_name?: string
        }
        if (!brief?.trim()) return json({ error: 'Tell the AI what this email is about.' }, 400)

        // ── Optional event context + cover hero ──
        let eventContext = ''
        let heroHtml = ''
        if (event_id) {
            const { data: ev } = await supabase
                .from('events')
                .select('id, title, cover_image_url, start_datetime, venue_name, city, ticket_price, ticket_tiers(price, is_active)')
                .eq('id', event_id)
                .maybeSingle()
            if (ev) {
                const tiers = ((ev.ticket_tiers as { price: number; is_active: boolean }[] | null) || []).filter(t => t.is_active)
                const price = tiers.length ? Math.min(...tiers.map(t => Number(t.price))) : Number(ev.ticket_price || 0)
                const priceLabel = price === 0 ? 'Free' : `From ₱${price.toLocaleString()}`
                const venue = [ev.venue_name, ev.city].filter(Boolean).join(', ')
                const url = `https://hanghut.com/events/${ev.id}`
                eventContext = `\n\nEVENT CONTEXT (weave in naturally; link the CTA button to the event URL):\n- Title: ${ev.title}\n- Date: ${fmtDate(ev.start_datetime)}\n- Venue: ${venue || 'n/a'}\n- Price: ${priceLabel}\n- Event URL: ${url}`
                if (ev.cover_image_url) {
                    heroHtml = `<a href="${url}" style="text-decoration:none;"><img src="${esc(ev.cover_image_url)}" alt="${esc(ev.title)}" width="100%" style="display:block;width:100%;max-width:100%;height:auto;border:0;border-radius:12px;margin:0 0 18px;" /></a>`
                }
            }
        }

        const toneLine = tone?.trim() ? `\nDESIRED TONE: ${tone.trim()}.` : ''
        const senderLine = business_name?.trim() ? `\nSENDER (business): ${business_name.trim()}.` : ''

        const systemPrompt = `You are HangHut's email marketing copywriter for event organizers in the Philippines. Write promotional emails people actually want to open and click.

Return ONLY a single JSON object (no markdown, no commentary) in exactly this shape:
{
  "subjects": string[],        // 3 distinct subject-line options, <= 60 chars, no ALL CAPS, at most one emoji each
  "preview_text": string,      // one short inbox preview line (<= 90 chars)
  "html": string               // the email body as email-safe HTML
}

HTML RULES (this renders in EMAIL CLIENTS, not a browser — stay email-safe):
- Output a BODY FRAGMENT only. NEVER emit <html>, <head>, <body>, <style>, <script>, <link>, or class= attributes. ALL styling must be inline style="..." attributes (email clients strip <style> blocks).
- Allowed tags: <div> <p> <h1> <h2> <h3> <ul> <li> <strong> <em> <a> <br> <hr> <span>, plus <table> <tr> <td> for layout/columns. Do NOT use <img> — a cover image is added automatically when relevant.
- Allowed CSS only: color, background-color, font-size, font-weight, font-family, line-height, text-align, padding, margin, border, border-radius, width, max-width. Do NOT use flexbox, grid, position, float, transform, or web/Google fonts (use safe stacks like Arial, Helvetica, sans-serif). Single column, wrap content in a max-width:600px container.
- The CTA is a single button-styled <a>, e.g. style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 28px;border-radius:999px;". Link it to the event URL if provided, otherwise https://hanghut.com.
- You MAY start with a greeting containing the literal token {{first_name}} (filled per recipient). Use {{business_name}} for the sender name if helpful. Use each token at most once.

DESIGN — MATCH THE EFFORT TO THE BRIEF:
- DEFAULT (the brief just states the message): keep it clean and minimal — a hook, 1–3 short paragraphs, an optional tight <ul>, one CTA. Little to no decoration.
- WHEN THE BRIEF ASKS FOR DESIGN (mentions branding, colors, a "designed"/"beautiful"/"bold"/"eye-catching" look, sections, cards, or a specific vibe): build a fully designed, email-safe layout with inline CSS — e.g. a colored header/hero band with a big headline, content cards (a <div> or <td> with background-color + padding + border-radius), section dividers (<hr> or bordered rows), accent colors, and generous spacing. Use HangHut's brand indigo #4f46e5 as the primary accent unless the brief specifies other colors. Keep it tasteful and mobile-readable.
- Never trade deliverability for looks: inline styles only, no unsupported CSS, keep a healthy text-to-markup ratio.

WRITING STYLE:
- Lively and genuine, never corporate. Match the brief's language — English, Tagalog, or Taglish.
- Never fabricate specifics (dates, prices, venues, lineups) that are not given in the brief or event context.${toneLine}${senderLine}`

        const userContent = `${brief.trim()}${eventContext}`
        const complete = (model: string) => fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`,
            },
            body: JSON.stringify({
                model,
                temperature: 0.75,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userContent },
                ],
            }),
        })

        // First choice: whatever GROQ_MODEL pins, else the top preference.
        let candidates = [GROQ_MODEL || MODEL_PREFERENCE[0]]
        let groqRes = await complete(candidates[0])
        let usedModel = candidates[0]
        let lastErrText = ''

        // A 404 here means "this key cannot run that model" — retrying the same
        // name forever is what left the composer dead. Ask the key what it has
        // and work down the list instead.
        if (groqRes.status === 404) {
            lastErrText = await groqRes.text()
            console.error('Groq model unavailable', usedModel, lastErrText)
            const discovered = await availableChatModels()
            candidates = discovered.filter(m => m !== usedModel).slice(0, 4)
            for (const model of candidates) {
                const attempt = await complete(model)
                if (attempt.ok) {
                    console.log(`Groq fell back to ${model} (pin GROQ_MODEL to skip discovery)`)
                    groqRes = attempt
                    usedModel = model
                    break
                }
                lastErrText = await attempt.text()
                console.error('Groq fallback failed', model, attempt.status, lastErrText)
                groqRes = attempt
            }
        }

        if (!groqRes.ok) {
            if (groqRes.status !== 404) lastErrText = await groqRes.text()
            console.error('Groq error', usedModel, groqRes.status, lastErrText)
            // A 404 is a configuration problem, not a blip. Telling an organizer
            // to "please try again" sends them into a loop that cannot succeed.
            const message = groqRes.status === 404
                ? 'The AI writer is not configured correctly on our side. We have been alerted — please use a template for now.'
                : groqRes.status === 429
                    ? 'The AI writer is busy right now. Give it a minute and try again.'
                    : `AI error (${groqRes.status}). Please try again.`
            return json({ error: message }, 502)
        }

        const groqData = await groqRes.json()
        const text = groqData?.choices?.[0]?.message?.content
        if (!text) return json({ error: 'The AI returned nothing. Try a more specific brief.' }, 422)

        let out: Record<string, unknown>
        try {
            out = parseJson(text)
        } catch {
            return json({ error: 'AI returned an unexpected format. Please try again.' }, 502)
        }

        const subjects = Array.isArray(out.subjects)
            ? (out.subjects as unknown[]).map(s => String(s)).filter(Boolean).slice(0, 5)
            : []
        const bodyHtml = typeof out.html === 'string' ? out.html : ''
        const preview_text = typeof out.preview_text === 'string' ? out.preview_text : ''
        if (!bodyHtml || subjects.length === 0) {
            return json({ error: 'Could not generate copy from that brief. Add a bit more detail.' }, 422)
        }

        return json({ subjects, preview_text, html: heroHtml + bodyHtml })
    } catch (err) {
        console.error('ai-marketing-copy error', err)
        return json({ error: 'Something went wrong generating the copy.' }, 500)
    }
})
