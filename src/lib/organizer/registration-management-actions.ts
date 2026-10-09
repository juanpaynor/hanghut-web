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
     * `total` counts every registration the list actually shows, which excludes
     * cancelled ones — summing the three review buckets instead would print a
     * count that disagreed with the list beneath it.
     *
     * Cancelled is excluded everywhere here because expire_stale_registrations()
     * releases abandoned unpaid checkouts to that status: an organizer asked for
     * their roster to show paid attendees only, and a released row reappearing as
     * "cancelled" is the exact noise the release was meant to remove.
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
        .neq('status', 'cancelled')
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
            .eq('event_id', eventId)
            .neq('status', 'cancelled'),
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
        /**
         * Did this person actually pay?
         *
         * `status` is the APPROVAL state (pending/approved/rejected) and on an
         * auto-approving event it reads "auto_approved" on every single row —
         * which is why organizers were exporting this file AND the customers
         * file and reconciling them by hand, name by name.
         */
        payment: PaymentState
        submitted: string
        /** Display form — a file answer is its filename. Used by the PDF. */
        answers: string[]
        /**
         * Full fidelity — a file answer also carries its storage path. Used by
         * CSV and XLSX, where losing the pointer to an uploaded ID means the
         * export cannot be reconciled against the originals. Not the signed
         * URL: those expire, and a spreadsheet outlives them.
         */
        answersFull: string[]
    }[]
    /** True when EXPORT_CAP was reached and rows were genuinely left behind. */
    truncated: boolean
}

const EXPORT_CAP = 20000

/**
 * An answer as a person reads it.
 *
 * A file answer is JSON living in a text column. Dumping it raw put a
 * 185-character blob in the cell — unreadable in a spreadsheet, and in the PDF
 * it let one column claim 146mm and squeeze every other column down to two
 * characters per line, which rendered the headings vertically, one letter per
 * row. The filename is what a human actually wants; the path is only useful to
 * the Responses tab, which already has it.
 */
function displayAnswer(raw: unknown, withPath = false): string {
    if (raw == null) return ''
    if (Array.isArray(raw)) return raw.join('; ')
    const s = String(raw)
    if (s.trim().startsWith('{')) {
        try {
            const v = JSON.parse(s)
            if (v && typeof v.path === 'string') {
                const name = String(v.name || 'file')
                return withPath ? `${name} [${v.path}]` : name
            }
        } catch {
            // Not a file record — fall through and show the text as typed.
        }
    }
    return s
}

/**
 * One loader behind every export.
 *
 * CSV and PDF built their own queries once and immediately disagreed about
 * which columns existed — the CSV gained a Ticket column and the PDF didn't.
 * Sharing the fetch means a column added for one shows up in the other.
 */
const PAGE = 1000

/**
 * Paid-ness of a registration.
 *
 * Deliberately four states, not a boolean. Across the platform 28 registrations
 * have a live ticket with no completed intent (free entries, box office, comps)
 * and 24 have a completed intent with NO ticket — people who paid and cannot get
 * in. Collapsing those into "paid" hides the second group, which is the one that
 * needs someone to do something.
 */
export type PaymentState = 'Paid' | 'Paid - no ticket issued' | 'Refunded' | 'Unpaid'


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

    // PAGED, not one .limit(20000) call. PostgREST silently clamps a response to
    // the project's max-rows setting, so a single large request returns a short
    // list with no error and no indication anything is missing -- an export that
    // quietly loses registrations is worse than one that fails. Ranged pages
    // cannot be clamped without the short page telling us we are done.
    const rows: any[] = []
    let truncated = false
    for (let offset = 0; offset < EXPORT_CAP; offset += PAGE) {
        const { data: chunk, error } = await adminClient
            .from('event_registrations')
            .select(
                `
                id, guest_email, guest_name, status, created_at,
                tier:ticket_tiers ( name ),
                user:users!event_registrations_user_id_fkey ( display_name, email ),
                registration_answers ( question_id, answer )
            `
            )
            .eq('event_id', eventId)
            .neq('status', 'cancelled')
            .order('created_at', { ascending: true })
            .range(offset, offset + PAGE - 1)

        if (error) {
            console.error('loadExportBundle error:', error)
            return { error: 'Could not build the export.' }
        }
        rows.push(...(chunk ?? []))
        if (!chunk || chunk.length < PAGE) break
        if (rows.length >= EXPORT_CAP) { truncated = true; break }
    }

    // TIERS COME FROM `tickets`, NOT `event_registrations.tier_id`.
    //
    // That column is populated on only 55 of 1,251 registrations (4.4%), which is
    // why the Ticket column has always been blank. The issued ticket rows carry
    // both `registration_id` and the tier, and cover 1,063 of those 1,251 — so
    // the answer the organizer wants is there, just one table over.
    //
    // Paged for the same reason the rows are: a single large request is silently
    // clamped by PostgREST, and a half-filled tier column is worse than none.
    const ticketRows: any[] = []
    for (let offset = 0; offset < EXPORT_CAP; offset += PAGE) {
        const { data: chunk, error: tErr } = await adminClient
            .from('tickets')
            .select('registration_id, status, tier, tier_row:ticket_tiers ( name )')
            .eq('event_id', eventId)
            .not('registration_id', 'is', null)
            .range(offset, offset + PAGE - 1)
        if (tErr) {
            // Not fatal. A tier column that fails to resolve should cost the
            // organizer that column, not the whole export.
            console.error('loadExportBundle tickets error:', tErr)
            break
        }
        ticketRows.push(...(chunk ?? []))
        if (!chunk || chunk.length < PAGE) break
    }

    // "VIP x2; General Admission" — grouped and counted, because one registration
    // can buy several tickets across different tiers. Refunded ones are labelled
    // rather than dropped: silently omitting them would have an organizer count
    // shirts for a ticket that no longer exists, and silently including them
    // would overcount.
    const tiersByRegistration = new Map<string, string>()
    {
        const grouped = new Map<string, Map<string, number>>()
        for (const t of ticketRows) {
            const regId = t.registration_id as string
            if (!regId) continue
            // The legacy `tickets.tier` TEXT column holds a SLUG on rows whose
            // tier_id was never set, so the same tier arrives as both
            // "General Admission" and "general_admission" and groups as two
            // entries. Normalising the fallback makes them merge.
            const raw = (t.tier_row?.name || t.tier || 'Ticket') as string
            const name = t.tier_row?.name
                ? raw
                : raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
                      .replace(/\b\w/g, (c) => c.toUpperCase())
            const label = t.status === 'refunded' ? `${name} (refunded)` : name
            if (!grouped.has(regId)) grouped.set(regId, new Map())
            const counts = grouped.get(regId)!
            counts.set(label, (counts.get(label) ?? 0) + 1)
        }
        for (const [regId, counts] of grouped) {
            tiersByRegistration.set(
                regId,
                [...counts.entries()]
                    .map(([name, n]) => (n > 1 ? `${name} \u00D7${n}` : name))
                    .join('; '),
            )
        }
    }

    // PAID-BUT-NO-TICKET: the ticket rows alone are not the whole truth.
    //
    // A registration's paid-ness is checked against BOTH the issued tickets and
    // the completed purchase intents, matched on the canonical lowercased email.
    // Platform-wide the two disagree on ~52 of 1,362 registrations: 28 have a
    // ticket and no intent (free, box office, comped) and 24 have an intent and
    // no ticket — the late-payment class, where someone paid and has nothing to
    // show at the door. Those must surface, not silently read as "Paid".
    const paidEmails = new Set<string>()
    for (let offset = 0; offset < EXPORT_CAP; offset += PAGE) {
        const { data: chunk, error: iErr } = await adminClient
            .from('purchase_intents')
            .select('guest_email, user:users!purchase_intents_user_id_fkey ( email )')
            .eq('event_id', eventId)
            .eq('status', 'completed')
            .range(offset, offset + PAGE - 1)
        if (iErr) {
            console.error('loadExportBundle intents error:', iErr)
            break
        }
        for (const i of chunk ?? []) {
            const em = ((i as any).user?.email || (i as any).guest_email || '').toLowerCase().trim()
            if (em) paidEmails.add(em)
        }
        if (!chunk || chunk.length < PAGE) break
    }

    // Live vs refunded per registration, from the ticket rows already fetched.
    const liveTickets = new Set<string>()
    const refundedOnly = new Set<string>()
    for (const t of ticketRows) {
        const regId = t.registration_id as string
        if (!regId) continue
        if (t.status === 'refunded' || t.status === 'cancelled') refundedOnly.add(regId)
        else liveTickets.add(regId)
    }

    const paymentFor = (regId: string, email: string): PaymentState => {
        if (liveTickets.has(regId)) return 'Paid'
        if (paidEmails.has(email.toLowerCase().trim())) return 'Paid - no ticket issued'
        if (refundedOnly.has(regId)) return 'Refunded'
        return 'Unpaid'
    }

    const cols = (questions ?? []) as { id: string; label: string }[]

    return {
        bundle: {
            title: event?.title || 'Event',
            startsAt: event?.start_datetime ?? null,
            venue: event?.venue_name ?? null,
            truncated,
            questions: cols.map(q => ({ id: q.id, label: q.label })),
            rows: rows.map((r: any) => {
                const byQuestion = new Map<string, any>(
                    (r.registration_answers || []).map((a: any) => [a.question_id, a.answer])
                )
                const email = r.user?.email || r.guest_email || ''
                return {
                    name: r.user?.display_name || r.guest_name || '',
                    email,
                    payment: paymentFor(r.id, email),
                    // Falls back to the registration's own tier_id for the 4.4%
                    // that have one but never produced a ticket row.
                    ticket: tiersByRegistration.get(r.id) || r.tier?.name || '',
                    status: r.status,
                    submitted: formatInManila(r.created_at, {
                        year: 'numeric', month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                    }),
                    answers: cols.map(q => displayAnswer(byQuestion.get(q.id))),
                    answersFull: cols.map(q => displayAnswer(byQuestion.get(q.id), true)),
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

/**
 * Registrations as CSV.
 *
 * `paidOnly` exists because an abandoned checkout still writes a registration —
 * it has to, it is where the answers live — so the export mixed people who paid
 * with people who only started. On SINADYA RUN 2026 that was 12 of 28 rows, and
 * the organizer was reconciling them against a second export by hand.
 */
/**
 * 'Paid - no ticket issued' counts as paid: they paid. It keeps its own label in
 * the Payment column so the gap stays visible inside the filtered file.
 *
 * Not exported — a "use server" module may only export async functions — which
 * is also why it lives here rather than in the component: CSV filters here, and
 * the PDF/XLSX bundle filters here too, so one definition serves all three.
 */
function keepPaid(rows: ExportBundle['rows'], paidOnly?: boolean) {
    if (!paidOnly) return rows
    return rows.filter(r => r.payment === 'Paid' || r.payment === 'Paid - no ticket issued')
}

export async function exportEventRegistrationsCsv(
    eventId: string,
    opts: { paidOnly?: boolean } = {}
): Promise<{ csv?: string; filename?: string; error?: string }> {
    const { bundle, error } = await loadExportBundle(eventId)
    if (error || !bundle) return { error: error || 'Could not build the export.' }

    const rows = keepPaid(bundle.rows, opts.paidOnly)

    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const header = ['Name', 'Email', 'Payment', 'Ticket tier', 'Status', 'Submitted', ...bundle.questions.map(q => q.label)]
    const body = rows.map(r =>
        [r.name, r.email, r.payment, r.ticket, r.status, r.submitted, ...r.answersFull].map(cell).join(',')
    )

    return {
        csv: [header.map(cell).join(','), ...body].join('\n'),
        filename: `${exportSlug(bundle.title)}-registrations${opts.paidOnly ? '-paid' : ''}.csv`,
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
    eventId: string,
    opts: { paidOnly?: boolean } = {}
): Promise<{ bundle?: ExportBundle; error?: string }> {
    const res = await loadExportBundle(eventId)
    if (!res.bundle || !opts.paidOnly) return res
    // Filtered HERE, not in the component, so PDF and XLSX cannot disagree with
    // the CSV about who counts as paid.
    return { bundle: { ...res.bundle, rows: keepPaid(res.bundle.rows, true) } }
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
