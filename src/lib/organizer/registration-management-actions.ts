'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { formatInManila } from '@/lib/datetime'
import { getActingPartnerId } from '@/lib/auth/cached'

// Edge functions must be called via the raw Supabase project URL, not the custom domain
const SUPABASE_FUNCTIONS_URL = 'https://rahhezqtkpvkialnduft.supabase.co/functions/v1'

export interface EventRegistration {
    id: string
    event_id: string
    user_id: string | null
    guest_email: string | null
    guest_name: string | null
    tier_id: string | null
    status: 'pending' | 'approved' | 'rejected' | 'auto_approved' | 'cancelled'
    rejection_reason: string | null
    reviewed_by: string | null
    reviewed_at: string | null
    created_at: string
    user?: { full_name: string | null; email: string | null } | null
    tier?: { name: string } | null
    /**
     * Keyed by question id, NOT by label. The label used to be nested inside
     * every answer row, which meant a 94-character question was re-sent once
     * per answer: 2,061 rows for one 521-person event, ~92% of a 210 kB payload
     * being the same four strings. Labels now travel once, in `questions`.
     */
    answers: { question_id: string; answer: any }[]
}

/** Sent ONCE per response, not once per answer. */
export interface RegistrationQuestion {
    id: string
    label: string
    question_type: string
    display_order: number
}

export interface RegistrationsPage {
    registrations: EventRegistration[]
    questions: RegistrationQuestion[]
    /**
     * Whole-event totals from SQL — never derived from the page in the browser.
     * `total` counts EVERY registration including cancelled ones, because the
     * non-approval list shows every row; summing the three review buckets
     * instead would print a count that disagreed with the list beneath it.
     */
    counts: { pending: number; approved: number; rejected: number; total: number }
    page: number
    per_page: number
    total_pages: number
}

// Not exported: a "use server" module may only export async functions.
const REGISTRATIONS_PER_PAGE = 25

/**
 * Resolve the acting partner and confirm they own this event.
 * Shared so the read path and the export path can never disagree about access.
 */
async function authorizeEvent(eventId: string): Promise<string | null> {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    // Acting partner (owner OR platform-support seat), the same way the rest of
    // the dashboard does. Comparing partners.user_id to the caller meant a ghost
    // seat saw an empty Registrations tab on an event that had hundreds.
    const actingPartnerId = await getActingPartnerId(user.id)
    if (!actingPartnerId) return null

    const { data: ownerCheck } = await adminClient
        .from('events')
        .select('id, organizer_id')
        .eq('id', eventId)
        .maybeSingle()
    if (!ownerCheck || ownerCheck.organizer_id !== actingPartnerId) return null

    return actingPartnerId
}

/** Registration ids whose owner matches a free-text search. */
async function searchMatchedUserIds(term: string): Promise<string[]> {
    const adminClient = createAdminClient()
    // 45 of 824 registrations on prod are signed-in users carrying NO guest_name
    // or guest_email, so searching the guest columns alone silently loses them.
    // Resolve matching users first and include them by id.
    const { data } = await adminClient
        .from('users')
        .select('id')
        .or(`display_name.ilike.%${term}%,email.ilike.%${term}%`)
        .limit(500)
    return (data ?? []).map((u: any) => u.id)
}

const STATUS_GROUPS = {
    pending: ['pending'],
    approved: ['approved', 'auto_approved'],
    rejected: ['rejected'],
} as const

export type RegistrationStatusGroup = keyof typeof STATUS_GROUPS

/**
 * One PAGE of registrations, plus whole-event counts and the question list.
 *
 * Deliberately returns counts from SQL rather than letting the client count the
 * array it was given: the moment this paginates, `registrations.filter(...)`
 * in the browser is counting one page and calling it the total.
 */
export async function getEventRegistrations(
    eventId: string,
    opts: {
        statusGroup?: RegistrationStatusGroup
        page?: number
        perPage?: number
        search?: string
    } = {}
): Promise<RegistrationsPage> {
    const empty: RegistrationsPage = {
        registrations: [],
        questions: [],
        counts: { pending: 0, approved: 0, rejected: 0, total: 0 },
        page: 1,
        per_page: opts.perPage ?? REGISTRATIONS_PER_PAGE,
        total_pages: 0,
    }

    const partnerId = await authorizeEvent(eventId)
    if (!partnerId) return empty

    const adminClient = createAdminClient()
    const perPage = Math.min(100, Math.max(1, opts.perPage ?? REGISTRATIONS_PER_PAGE))
    const page = Math.max(1, opts.page ?? 1)
    const search = opts.search?.trim() || ''

    const matchedUserIds = search ? await searchMatchedUserIds(search) : []

    const applyFilters = (q: any) => {
        if (opts.statusGroup) q = q.in('status', STATUS_GROUPS[opts.statusGroup] as unknown as string[])
        if (search) {
            const clauses = [
                `guest_name.ilike.%${search}%`,
                `guest_email.ilike.%${search}%`,
                ...(matchedUserIds.length ? [`user_id.in.(${matchedUserIds.join(',')})`] : []),
            ]
            q = q.or(clauses.join(','))
        }
        return q
    }

    // Counts, questions and the page itself are independent — fetch together.
    const countFor = (group: RegistrationStatusGroup) =>
        adminClient
            .from('event_registrations')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', eventId)
            .in('status', STATUS_GROUPS[group] as unknown as string[])

    const from = (page - 1) * perPage
    const to = from + perPage - 1

    let rowsQuery = adminClient
        .from('event_registrations')
        .select(
            `
            id,
            event_id,
            user_id,
            guest_email,
            guest_name,
            tier_id,
            status,
            rejection_reason,
            reviewed_by,
            reviewed_at,
            created_at,
            user:users!event_registrations_user_id_fkey ( display_name, email ),
            registration_answers ( question_id, answer )
        `,
            { count: 'exact' }
        )
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
        .range(from, to)

    rowsQuery = applyFilters(rowsQuery)

    const [
        { data: rows, error, count: filteredCount },
        { data: questions },
        { count: pendingCount },
        { count: approvedCount },
        { count: rejectedCount },
        { count: allCount },
    ] = await Promise.all([
        rowsQuery,
        adminClient
            .from('registration_questions')
            .select('id, label, question_type, display_order')
            .eq('event_id', eventId)
            // Sections are layout, not data — they would show as a column every
            // respondent left blank.
            .neq('question_type', 'section')
            .order('display_order', { ascending: true }),
        countFor('pending'),
        countFor('approved'),
        countFor('rejected'),
        adminClient
            .from('event_registrations')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', eventId),
    ])

    if (error) {
        console.error('getEventRegistrations error:', JSON.stringify(error), error)
        return empty
    }

    const registrations: EventRegistration[] = (rows || []).map((r: any) => ({
        id: r.id,
        event_id: r.event_id,
        user_id: r.user_id,
        guest_email: r.guest_email,
        guest_name: r.guest_name,
        tier_id: r.tier_id,
        status: r.status,
        rejection_reason: r.rejection_reason,
        reviewed_by: r.reviewed_by,
        reviewed_at: r.reviewed_at,
        created_at: r.created_at,
        user: r.user ? { full_name: r.user.display_name, email: r.user.email } : null,
        tier: null,
        answers: (r.registration_answers || []).map((a: any) => ({
            question_id: a.question_id,
            answer: a.answer,
        })),
    }))

    return {
        registrations,
        questions: (questions ?? []) as RegistrationQuestion[],
        counts: {
            pending: pendingCount ?? 0,
            approved: approvedCount ?? 0,
            rejected: rejectedCount ?? 0,
            total: allCount ?? 0,
        },
        page,
        per_page: perPage,
        total_pages: Math.max(1, Math.ceil((filteredCount ?? 0) / perPage)),
    }
}

/**
 * The whole event as CSV, built on the server.
 *
 * This exists because pagination breaks the old export: it stringified whatever
 * array the browser happened to be holding, so a paginated tab would have
 * quietly exported page one and called it the attendee list. Phase 3 turns this
 * into a streamed route with tier/payment columns; for now it is correct and
 * capped, which is the part that matters.
 */
export type AnswerFieldKind = 'choice' | 'contact' | 'freetext' | 'longform' | 'file'

export interface AnswerQuestionStats {
    question_id: string
    label: string
    question_type: string
    display_order: number
    kind: AnswerFieldKind
    kind_source: 'inferred' | 'override'
    /** People who answered. For multi-select this is lower than `selections`. */
    answered: number
    selections: number
    distinct_values: number
    distribution: { value: string; n: number }[]
    tail_values: number
    tail_answers: number
}

export interface AnswerStats {
    registrations: number
    questions: AnswerQuestionStats[]
}

/**
 * Per-question analytics, computed entirely in Postgres.
 *
 * The RPC gates itself on can_manage_partner — it is reachable over PostgREST,
 * so the caller's check is not the only thing standing between a stranger and
 * an organizer's answers.
 */
export async function getEventAnswerStats(eventId: string): Promise<AnswerStats | null> {
    const partnerId = await authorizeEvent(eventId)
    if (!partnerId) return null

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_event_answer_stats', { p_event_id: eventId })

    if (error) {
        console.error('getEventAnswerStats error:', error)
        return null
    }
    return data as AnswerStats
}

/**
 * Override how a question is treated. Inference is right nearly always, but it
 * is inference — an organizer who knows their own form must be able to correct
 * it, and the correction has to stick.
 */
export async function setQuestionAnalyticsKind(
    eventId: string,
    questionId: string,
    kind: AnswerFieldKind | null
): Promise<{ success: boolean; error?: string }> {
    const partnerId = await authorizeEvent(eventId)
    if (!partnerId) return { success: false, error: 'Unauthorized' }

    const adminClient = createAdminClient()
    const { error } = await adminClient
        .from('registration_questions')
        .update({ analytics_kind: kind })
        .eq('id', questionId)
        .eq('event_id', eventId)

    if (error) {
        console.error('setQuestionAnalyticsKind error:', error)
        return { success: false, error: 'Could not update.' }
    }
    revalidatePath(`/organizer/events/${eventId}`)
    return { success: true }
}

interface ExportBundle {
    title: string
    startsAt: string | null
    venue: string | null
    questions: { id: string; label: string }[]
    rows: {
        name: string
        email: string
        ticket: string
        status: string
        submitted: string
        answers: string[]
    }[]
}

const EXPORT_CAP = 20000

/**
 * One loader behind every export.
 *
 * CSV and PDF built their own queries once and immediately disagreed about
 * which columns existed — the CSV gained a Ticket column and the PDF didn't.
 * Sharing the fetch means a column added for one shows up in the other.
 */
async function loadExportBundle(
    eventId: string
): Promise<{ bundle?: ExportBundle; error?: string }> {
    const partnerId = await authorizeEvent(eventId)
    if (!partnerId) return { error: 'Unauthorized' }

    const adminClient = createAdminClient()

    const [{ data: event }, { data: questions }] = await Promise.all([
        adminClient
            .from('events')
            .select('title, start_datetime, venue_name')
            .eq('id', eventId)
            .maybeSingle(),
        adminClient
            .from('registration_questions')
            .select('id, label, display_order')
            .eq('event_id', eventId)
            // Sections carry no answer — they would export as a column every
            // respondent left blank.
            .neq('question_type', 'section')
            .order('display_order', { ascending: true }),
    ])

    const { data: rows, error } = await adminClient
        .from('event_registrations')
        .select(
            `
            guest_email, guest_name, status, created_at,
            tier:ticket_tiers ( name ),
            user:users!event_registrations_user_id_fkey ( display_name, email ),
            registration_answers ( question_id, answer )
        `
        )
        .eq('event_id', eventId)
        .order('created_at', { ascending: true })
        .limit(EXPORT_CAP)

    if (error) {
        console.error('loadExportBundle error:', error)
        return { error: 'Could not build the export.' }
    }

    const cols = (questions ?? []) as { id: string; label: string }[]

    return {
        bundle: {
            title: event?.title || 'Event',
            startsAt: event?.start_datetime ?? null,
            venue: event?.venue_name ?? null,
            questions: cols.map(q => ({ id: q.id, label: q.label })),
            rows: (rows ?? []).map((r: any) => {
                const byQuestion = new Map<string, any>(
                    (r.registration_answers || []).map((a: any) => [a.question_id, a.answer])
                )
                return {
                    name: r.user?.display_name || r.guest_name || '',
                    email: r.user?.email || r.guest_email || '',
                    ticket: r.tier?.name || '',
                    status: r.status,
                    submitted: formatInManila(r.created_at, {
                        year: 'numeric', month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                    }),
                    answers: cols.map(q => {
                        const v = byQuestion.get(q.id)
                        return Array.isArray(v) ? v.join('; ') : String(v ?? '')
                    }),
                }
            }),
        },
    }
}

function exportSlug(title: string): string {
    return (title || 'event')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase()
}

export async function exportEventRegistrationsCsv(
    eventId: string
): Promise<{ csv?: string; filename?: string; error?: string }> {
    const { bundle, error } = await loadExportBundle(eventId)
    if (error || !bundle) return { error: error || 'Could not build the export.' }

    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const header = ['Name', 'Email', 'Ticket', 'Status', 'Submitted', ...bundle.questions.map(q => q.label)]
    const body = bundle.rows.map(r =>
        [r.name, r.email, r.ticket, r.status, r.submitted, ...r.answers].map(cell).join(',')
    )

    return {
        csv: [header.map(cell).join(','), ...body].join('\n'),
        filename: `${exportSlug(bundle.title)}-registrations.csv`,
    }
}

/**
 * The same data, unformatted, for the client to lay out as a PDF.
 *
 * The PDF is built in the browser rather than here: jsPDF already ships in the
 * bundle for the attendee export, and streaming a generated binary back through
 * a server action would mean base64 through the RSC payload for no gain.
 */
export async function getEventResponsesExport(
    eventId: string
): Promise<{ bundle?: ExportBundle; error?: string }> {
    return loadExportBundle(eventId)
}

export async function approveRegistration(
    registrationId: string,
    eventId: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    // Explicit ownership check — don't rely on RLS silently blocking
    const actingPartnerId = await getActingPartnerId(user.id)
    if (!actingPartnerId) return { success: false, error: 'Unauthorized' }
    const partner = { id: actingPartnerId }

    const { data: eventCheck } = await supabase
        .from('events')
        .select('id')
        .eq('id', eventId)
        .eq('organizer_id', partner.id)
        .single()

    if (!eventCheck) return { success: false, error: 'Unauthorized: not the organizer of this event' }

    // Use admin client so RLS cannot silently swallow the update
    const { data: updated, error: updateError } = await adminClient
        .from('event_registrations')
        .update({
            status: 'approved',
            reviewed_by: user.id,
            reviewed_at: new Date().toISOString(),
        })
        .eq('id', registrationId)
        .select('id')

    if (updateError) return { success: false, error: updateError.message }
    if (!updated?.length) return { success: false, error: 'Registration not found' }

    // Fetch registration to determine if free (check tier price or event price)
    const { data: reg } = await adminClient
        .from('event_registrations')
        .select('user_id, guest_email, guest_name, tier_id, event_id')
        .eq('id', registrationId)
        .single()

    // Determine if free: check tier price if tier set, else check event ticket_price
    let isFreeEvent = false
    if (reg?.tier_id) {
        const { data: tier } = await adminClient
            .from('ticket_tiers')
            .select('price')
            .eq('id', reg.tier_id)
            .single()
        isFreeEvent = !tier || Number(tier.price) === 0
    } else {
        const { data: event } = await adminClient
            .from('events')
            .select('ticket_price')
            .eq('id', eventId)
            .single()
        isFreeEvent = !event || Number(event.ticket_price) === 0
    }

    // For free events: issue ticket via create-purchase-intent (which handles
    // reserve_tickets → issue_tickets → send-ticket-email with real QR code)
    if (isFreeEvent && reg) {
        try {
            const intentPayload: any = {
                event_id: reg.event_id,
                quantity: 1,
                registration_id: registrationId,
                // Organizer approving a free registration from the dashboard — still a
                // web-originated order, just not a buyer-initiated one.
                source: 'web',
            }
            if (reg.tier_id) intentPayload.tier_id = reg.tier_id
            // Pass guest_details so the server guard can match guest email ownership
            if (!reg.user_id && reg.guest_email) {
                intentPayload.guest_details = {
                    name: reg.guest_name || '',
                    email: reg.guest_email,
                    phone: '',
                }
            }

            const intentRes = await fetch(`${SUPABASE_FUNCTIONS_URL}/create-purchase-intent`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(intentPayload),
            })

            if (!intentRes.ok) {
                const err = await intentRes.text()
                console.error('create-purchase-intent failed on free approval:', err)
            } else {
                console.log('Free ticket issued via create-purchase-intent for registration:', registrationId)
            }
        } catch (e) {
            console.error('Failed to issue free ticket via create-purchase-intent (non-fatal):', e)
        }
    }

    // Fire push notification to the user (if they have an account)
    try {
        const { data: regForPush } = await adminClient
            .from('event_registrations')
            .select('user_id, event:events(title)')
            .eq('id', registrationId)
            .single()
        const reg = regForPush

        if (reg?.user_id) {
            await fetch(`${SUPABASE_FUNCTIONS_URL}/send-push`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_id: reg.user_id,
                    title: '✅ Registration Approved!',
                    body: `Your registration for ${(reg.event as any)?.title || 'the event'} has been approved.`,
                    data: {
                        type: 'ticket_approved',
                        event_id: eventId,
                        event_title: (reg.event as any)?.title || '',
                    },
                }),
            })
        }
    } catch (e) {
        console.error('Push notification failed (non-fatal):', e)
    }

    // Send approval email
    try {
        const { data: regForEmail } = await adminClient
            .from('event_registrations')
            .select(`
                guest_email,
                guest_name,
                user_id,
                event:events (
                    id,
                    title,
                    start_datetime,
                    venue_name,
                    approval_email_subject,
                    approval_email_body,
                    partners!events_organizer_id_fkey ( business_name )
                )
            `)
            .eq('id', registrationId)
            .single()

        const event = regForEmail?.event as any
        const recipientEmail = regForEmail?.guest_email
            || (regForEmail?.user_id
                ? (await adminClient.from('users').select('email').eq('id', regForEmail.user_id).single()).data?.email
                : null)

        // Always email approved registrants (not just when a custom body is set) —
        // it carries the link they need to come back and get their tickets.
        if (recipientEmail) {
            const recipientName = regForEmail?.guest_name || 'there'
            const eventDate = event.start_datetime
                ? formatInManila(event.start_datetime, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : ''

            const resolveTags = (str: string) =>
                str
                    .replace(/{{name}}/g, recipientName)
                    .replace(/{{event_title}}/g, event.title || '')
                    .replace(/{{event_date}}/g, eventDate)
                    .replace(/{{event_venue}}/g, event.venue_name || '')
                    .replace(/{{organizer_name}}/g, event.partners?.business_name || '')

            const subject = resolveTags(event.approval_email_subject || `Your registration for ${event.title} has been approved!`)
            const defaultBody = `Hi ${recipientName},\n\nGood news — your registration for ${event.title} has been approved! Tap the button below to get your tickets.`
            const rawBody = resolveTags(event.approval_email_body || defaultBody)
            // Wrap plain text in minimal HTML if it doesn't look like HTML
            const bodyHtml = rawBody.trimStart().startsWith('<')
                ? rawBody
                : `<div style="font-family:sans-serif;line-height:1.6;white-space:pre-wrap">${rawBody}</div>`

            // Append the all-important return link so the approved user can check out.
            const eventUrl = `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'hanghut.com'}/events/${event.id}`
            const htmlBody = `${bodyHtml}<div style="text-align:center;margin:28px 0"><a href="${eventUrl}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;font-weight:600;padding:14px 32px;border-radius:8px;font-family:sans-serif">Get your tickets</a></div>`

            await fetch(`${SUPABASE_FUNCTIONS_URL}/send-registration-email`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: recipientEmail,
                    subject,
                    html: htmlBody,
                    sender_name: event.partners?.business_name || 'HangHut',
                }),
            })
        }
    } catch (e) {
        console.error('Approval email failed (non-fatal):', e)
    }

    revalidatePath(`/organizer/events/${eventId}`)
    return { success: true }
}

export async function rejectRegistration(
    registrationId: string,
    eventId: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    // Explicit ownership check
    const actingPartnerId = await getActingPartnerId(user.id)
    if (!actingPartnerId) return { success: false, error: 'Unauthorized' }
    const partner = { id: actingPartnerId }

    const { data: eventCheck } = await supabase
        .from('events')
        .select('id')
        .eq('id', eventId)
        .eq('organizer_id', partner.id)
        .single()

    if (!eventCheck) return { success: false, error: 'Unauthorized: not the organizer of this event' }

    const { data: updated, error: updateError } = await adminClient
        .from('event_registrations')
        .update({
            status: 'rejected',
            rejection_reason: reason || null,
            reviewed_by: user.id,
            reviewed_at: new Date().toISOString(),
        })
        .eq('id', registrationId)
        .select('id')

    if (updateError) return { success: false, error: updateError.message }
    if (!updated?.length) return { success: false, error: 'Registration not found' }

    // Fire push notification
    try {
        const { data: reg } = await adminClient
            .from('event_registrations')
            .select('user_id, event:events(title)')
            .eq('id', registrationId)
            .single()

        if (reg?.user_id) {
            await fetch(`${SUPABASE_FUNCTIONS_URL}/send-push`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_id: reg.user_id,
                    title: '❌ Registration Not Approved',
                    body: `Your registration for ${(reg.event as any)?.title || 'the event'} was not approved.${reason ? ' Reason: ' + reason : ''}`,
                    data: {
                        type: 'ticket_rejected',
                        event_id: eventId,
                        event_title: (reg.event as any)?.title || '',
                        reason: reason || '',
                    },
                }),
            })
        }
    } catch (e) {
        console.error('Push notification failed (non-fatal):', e)
    }

    // Send rejection email
    try {
        const { data: regForEmail } = await adminClient
            .from('event_registrations')
            .select(`
                guest_email,
                guest_name,
                user_id,
                event:events (
                    title,
                    start_datetime,
                    venue_name,
                    rejection_email_subject,
                    rejection_email_body,
                    partners!events_organizer_id_fkey ( business_name )
                )
            `)
            .eq('id', registrationId)
            .single()

        const event = regForEmail?.event as any
        const recipientEmail = regForEmail?.guest_email
            || (regForEmail?.user_id
                ? (await adminClient.from('users').select('email').eq('id', regForEmail.user_id).single()).data?.email
                : null)

        if (recipientEmail && event?.rejection_email_body) {
            const recipientName = regForEmail?.guest_name || 'there'
            const eventDate = event.start_datetime
                ? formatInManila(event.start_datetime, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : ''

            const resolveTags = (str: string) =>
                str
                    .replace(/{{name}}/g, recipientName)
                    .replace(/{{event_title}}/g, event.title || '')
                    .replace(/{{event_date}}/g, eventDate)
                    .replace(/{{event_venue}}/g, event.venue_name || '')
                    .replace(/{{organizer_name}}/g, event.partners?.business_name || '')
                    .replace(/{{reason}}/g, reason || '')

            const subject = resolveTags(event.rejection_email_subject || `Update on your registration for ${event.title}`)
            const rawBody = resolveTags(event.rejection_email_body)
            const htmlBody = rawBody.trimStart().startsWith('<')
                ? rawBody
                : `<div style="font-family:sans-serif;line-height:1.6;white-space:pre-wrap">${rawBody}</div>`

            await fetch(`${SUPABASE_FUNCTIONS_URL}/send-registration-email`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: recipientEmail,
                    subject,
                    html: htmlBody,
                    sender_name: event.partners?.business_name || 'HangHut',
                }),
            })
        }
    } catch (e) {
        console.error('Rejection email failed (non-fatal):', e)
    }

    revalidatePath(`/organizer/events/${eventId}`)
    return { success: true }
}
