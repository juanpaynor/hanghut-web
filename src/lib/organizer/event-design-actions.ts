'use server'

import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getActingPartnerId } from '@/lib/auth/cached'

/**
 * Reusing a design instead of rebuilding it.
 *
 * Prod made the case plainly: Mimic Manila published 36 events whose design is
 * byte-identical — default / classic / default ground / dmserif / no countdown —
 * because the only way to get that page was to walk the six-section form again.
 * Comedy Manila's 19 designed events, by contrast, landed on EIGHT different
 * combinations, which is drift rather than art direction: nothing was holding a
 * house style in place.
 *
 * Both are the same missing idea — a design that lives somewhere other than on
 * one event row. Two halves:
 *
 *   listReusableEventDesigns()  copy a look off a past event (fixes repetition)
 *   get/saveBrandDesignDefault  one house look new events inherit (fixes drift)
 *
 * The brand default is stored on partners.branding.event_defaults. That jsonb
 * already exists and already carries the storefront's own design, so this needs
 * no migration; it is namespaced under its own key so it can never collide with
 * the storefront keys sitting beside it.
 */

/** The fields that constitute "the look", and nothing else.
 *  Pointedly excluded: title, cover, description, tickets, dates — copying a
 *  design must never copy content from one event onto another.
 *
 *  NOT exported: a 'use server' module may only export async functions, and a
 *  const array here is a value, not a type. Anything outside this file needs
 *  the EventDesign type, which erases at compile time and so is fine. */
const DESIGN_KEYS = [
    'theme', 'bg_style', 'page_layout', 'content_panel',
    'font_heading', 'font_body',
    'heading_color', 'text_color',
    'show_countdown', 'countdown_label', 'show_social_proof',
    'custom_css', 'bg_image_url',
    // Section arrangement travels with the look: hiding a section is the second
    // most used control on prod (87 events), and re-hiding it every time is
    // exactly the repetition this exists to remove.
    'order', 'hidden',
] as const

export type EventDesign = Partial<Record<typeof DESIGN_KEYS[number], unknown>> & {
    theme_color?: string | null
}

function pickDesign(layoutConfig: Record<string, unknown> | null, themeColor?: string | null): EventDesign {
    const out: EventDesign = {}
    for (const k of DESIGN_KEYS) {
        const v = layoutConfig?.[k]
        if (v !== undefined && v !== null) (out as Record<string, unknown>)[k] = v
    }
    if (themeColor) out.theme_color = themeColor
    return out
}

/** True when the organizer actually made choices, rather than the row just
 *  carrying the section order every event is created with. Without this the
 *  picker would offer 300 identical "designs" that are really the default. */
function hasRealDesign(lc: Record<string, unknown> | null): boolean {
    if (!lc) return false
    return Boolean(
        lc.page_layout || lc.bg_style || lc.theme || lc.content_panel ||
        lc.font_heading || lc.custom_css ||
        lc.show_countdown || lc.heading_color || lc.text_color,
    )
}

export type ReusableDesign = {
    eventId: string
    title: string
    coverImageUrl: string | null
    startDatetime: string | null
    design: EventDesign
    /** For the one-line summary under each row in the picker. */
    summary: string
}

const LAYOUT_NAMES: Record<string, string> = {
    default: 'Default', poster: 'Poster', stack: 'Stack', split: 'Split',
    marquee: 'Marquee', stub: 'Stub', billboard: 'Headliner', boutique: 'Boutique',
    minimal: 'Minimal', broadside: 'Broadside', editorial: 'Editorial', cinematic: 'Cinematic',
}
const BG_NAMES: Record<string, string> = {
    'cover-blur': 'cover glow', 'cover-full': 'full cover', spotlight: 'spotlight',
    default: 'clean', paper: 'paper', 'custom-image': 'custom image',
    particles: 'particles', 'gradient-mesh': 'gradient mesh', noise: 'film grain', parallax: 'parallax',
}

/**
 * The organizer's own past events that carry a design worth copying, newest
 * first. `excludeEventId` keeps the event being edited out of its own list.
 */
export async function listReusableEventDesigns(
    excludeEventId?: string
): Promise<{ designs?: ReusableDesign[]; error?: string }> {
    const { user } = await getAuthUser()
    if (!user) return { error: 'Not signed in' }

    const partnerId = await getActingPartnerId(user.id)
    if (!partnerId) return { error: 'No partner account' }

    const supabase = await createClient()
    const { data, error } = await supabase
        .from('events')
        .select('id, title, cover_image_url, start_datetime, theme_color, layout_config, created_at')
        .eq('organizer_id', partnerId)
        .order('created_at', { ascending: false })
        // Deliberately generous: the filtering below is on jsonb contents, which
        // is cheaper to do here than to express as a query that still has to be
        // right for rows written before any given key existed.
        .limit(120)

    if (error) {
        console.error('listReusableEventDesigns:', error)
        return { error: 'Could not load your past designs.' }
    }

    const seen = new Set<string>()
    const designs: ReusableDesign[] = []

    for (const row of data ?? []) {
        if (row.id === excludeEventId) continue
        const lc = (row.layout_config ?? null) as Record<string, unknown> | null
        if (!hasRealDesign(lc)) continue

        const design = pickDesign(lc, row.theme_color)

        // Mimic has 36 identical designs; listing all 36 would be the same wall
        // of choices this feature exists to remove. One row per distinct look,
        // newest kept, so the list reads as "your looks" not "your events".
        const fingerprint = JSON.stringify(
            DESIGN_KEYS.filter(k => k !== 'order' && k !== 'hidden').map(k => (design as Record<string, unknown>)[k] ?? null)
        ) + (row.theme_color ?? '')
        if (seen.has(fingerprint)) continue
        seen.add(fingerprint)

        const layout = LAYOUT_NAMES[String(lc?.page_layout ?? 'default')] ?? 'Default'
        const bg = BG_NAMES[String(lc?.bg_style ?? 'default')] ?? ''
        designs.push({
            eventId: row.id,
            title: row.title,
            coverImageUrl: row.cover_image_url,
            startDatetime: row.start_datetime,
            design,
            summary: [layout, bg && `${bg} background`].filter(Boolean).join(' · '),
        })

        if (designs.length >= 12) break
    }

    return { designs }
}

/* ── Brand-level default ────────────────────────────────────────────────── */

export async function getBrandDesignDefault(): Promise<{ design?: EventDesign | null; error?: string }> {
    const { user } = await getAuthUser()
    if (!user) return { error: 'Not signed in' }
    const partnerId = await getActingPartnerId(user.id)
    if (!partnerId) return { error: 'No partner account' }

    const supabase = await createClient()
    const { data, error } = await supabase
        .from('partners').select('branding').eq('id', partnerId).maybeSingle()
    if (error) return { error: 'Could not load your default look.' }

    const branding = (data?.branding ?? {}) as Record<string, unknown>
    const design = branding.event_defaults as EventDesign | undefined
    return { design: design && Object.keys(design).length ? design : null }
}

/**
 * Save (or clear, with null) the look new events start from.
 *
 * Read-modify-write on `branding` rather than a jsonb merge in SQL, because the
 * storefront's own design lives in the same column: a blind overwrite here
 * would silently erase the partner's brand page.
 */
export async function saveBrandDesignDefault(
    design: EventDesign | null
): Promise<{ ok?: true; error?: string }> {
    const { user } = await getAuthUser()
    if (!user) return { error: 'Not signed in' }
    const partnerId = await getActingPartnerId(user.id)
    if (!partnerId) return { error: 'No partner account' }

    const supabase = await createClient()
    const { data: current, error: readErr } = await supabase
        .from('partners').select('branding').eq('id', partnerId).maybeSingle()
    if (readErr) return { error: 'Could not save your default look.' }

    const branding = { ...((current?.branding ?? {}) as Record<string, unknown>) }
    if (design === null) delete branding.event_defaults
    else branding.event_defaults = design

    const { error } = await supabase.from('partners').update({ branding }).eq('id', partnerId)
    if (error) {
        console.error('saveBrandDesignDefault:', error)
        return { error: 'Could not save your default look.' }
    }
    return { ok: true }
}
