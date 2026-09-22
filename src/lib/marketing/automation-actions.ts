'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type AutomationTrigger = 'welcome' | 'post_event' | 'pre_event' | 'new_event' | 'abandoned_checkout' | 'winback'

export interface Automation {
    trigger_type: AutomationTrigger
    enabled: boolean
    subject: string | null
    html_content: string | null
    offset_minutes: number | null
}

const ALL_TRIGGERS: AutomationTrigger[] = ['welcome', 'pre_event', 'post_event', 'new_event', 'abandoned_checkout', 'winback']

// Sensible starting offsets (minutes) for the timed automations.
const DEFAULT_OFFSET: Partial<Record<AutomationTrigger, number>> = {
    pre_event: 1440,            // 1 day before
    post_event: 120,            // 2 hours after
    abandoned_checkout: 60,     // 1 hour after the cart is abandoned
    winback: 172800,            // 120 days (4 months) of silence
}

/** Resolve the caller's partner id (owner or team member). */
async function resolvePartnerId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: owner } = await supabase
        .from('partners').select('id').eq('user_id', user.id).maybeSingle()
    if (owner) return owner.id

    const { data: tm } = await supabase
        .from('partner_team_members').select('partner_id').eq('user_id', user.id).maybeSingle()
    return tm?.partner_id ?? null
}

/** Returns all 4 automation types, merged with any saved config (RLS-scoped). */
export async function getAutomations(): Promise<Automation[]> {
    const supabase = await createClient()
    const partnerId = await resolvePartnerId(supabase)
    if (!partnerId) return []

    const { data } = await supabase
        .from('email_automations')
        .select('trigger_type, enabled, subject, html_content, offset_minutes')
        .eq('partner_id', partnerId)

    const byType = new Map((data ?? []).map(a => [a.trigger_type, a]))
    return ALL_TRIGGERS.map(t => byType.get(t) as Automation ?? {
        trigger_type: t, enabled: false, subject: null, html_content: null,
        offset_minutes: DEFAULT_OFFSET[t] ?? null,
    })
}

export async function upsertAutomation(input: {
    trigger_type: AutomationTrigger
    subject: string
    html_content: string
    offset_minutes?: number | null
    enabled?: boolean
}) {
    const supabase = await createClient()
    const partnerId = await resolvePartnerId(supabase)
    if (!partnerId) return { error: 'Partner account not found' }

    if (input.enabled && (!input.subject?.trim() || !input.html_content?.trim())) {
        return { error: 'Add a subject and message before enabling this automation.' }
    }
    if (input.offset_minutes != null && input.offset_minutes < 0) {
        return { error: 'Timing must be a positive number.' }
    }

    const { error } = await supabase
        .from('email_automations')
        .upsert({
            partner_id: partnerId,
            trigger_type: input.trigger_type,
            subject: input.subject?.trim() || null,
            html_content: input.html_content?.trim() || null,
            offset_minutes: input.offset_minutes ?? null,
            enabled: input.enabled ?? false,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'partner_id,trigger_type' })

    if (error) return { error: error.message }
    revalidatePath('/organizer/marketing')
    return { success: true as const }
}

export async function toggleAutomation(trigger_type: AutomationTrigger, enabled: boolean) {
    const supabase = await createClient()
    const partnerId = await resolvePartnerId(supabase)
    if (!partnerId) return { error: 'Partner account not found' }

    // Can't enable an automation with no content.
    if (enabled) {
        const { data: existing } = await supabase
            .from('email_automations')
            .select('subject, html_content')
            .eq('partner_id', partnerId).eq('trigger_type', trigger_type).maybeSingle()
        if (!existing?.subject?.trim() || !existing?.html_content?.trim()) {
            return { error: 'Add a subject and message before enabling this automation.' }
        }
    }

    const { error } = await supabase
        .from('email_automations')
        .update({ enabled, updated_at: new Date().toISOString() })
        .eq('partner_id', partnerId).eq('trigger_type', trigger_type)

    if (error) return { error: error.message }
    revalidatePath('/organizer/marketing')
    return { success: true as const }
}

export interface AutomationStats {
    runs: number
    campaigns: number
    sent: number
    delivered: number
    opened: number
    clicked: number
    bounced: number
    orders: number
    revenue: number
    last_fired: string | null
}

/**
 * Live performance per automation, so the tab can answer the question it
 * currently can't: is this thing actually doing anything?
 *
 * An automation is the one part of marketing that runs while nobody is looking.
 * Mimic's abandoned-cart automation had been firing for a day before anyone
 * could tell from the UI — it showed the same static config card whether the
 * automation had sent nothing or had recovered money.
 *
 * Aggregated in SQL (get_automation_performance) rather than here, because the
 * naive version of this join fans out: runs × campaigns multiplies every total.
 */
export async function getAutomationPerformance(): Promise<Record<string, AutomationStats>> {
    const supabase = await createClient()
    const partnerId = await resolvePartnerId(supabase)
    if (!partnerId) return {}

    const { data, error } = await supabase.rpc('get_automation_performance', { p_partner_id: partnerId })
    if (error) {
        console.error('getAutomationPerformance failed', error)
        return {}
    }
    return (data ?? {}) as Record<string, AutomationStats>
}

/** The partner's own name, for the AI brief and the preview's token merge. */
export async function getPartnerContext(): Promise<{ id: string; business_name: string } | null> {
    const supabase = await createClient()
    const partnerId = await resolvePartnerId(supabase)
    if (!partnerId) return null
    const { data } = await supabase
        .from('partners').select('id, business_name').eq('id', partnerId).maybeSingle()
    return data ? { id: data.id, business_name: data.business_name } : null
}
