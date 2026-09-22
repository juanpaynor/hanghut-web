'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getActingPartnerId } from '@/lib/auth/cached'

/**
 * File answers on registration questions.
 *
 * A partner asks people to upload an ID, a receipt, proof of student status —
 * whatever their door needs. Three constraints shape the design:
 *
 * 1. The person uploading is usually NOT signed in. Registration is open to
 *    guests, so the flow cannot depend on a session.
 * 2. The bucket is private. A public bucket holding uploaded IDs would be
 *    readable by anyone who can guess a path, and storage paths are guessable.
 * 3. The file must not pass through a server action. Next.js caps server-action
 *    bodies (1MB by default) — a phone photo of an ID is bigger than that, and
 *    raising the cap to tunnel binaries through RSC is the wrong shape.
 *
 * So: the server mints a SIGNED UPLOAD URL scoped to one path, the browser PUTs
 * the bytes straight to storage, and the answer records the path. Reads go the
 * same way in reverse — a short-lived signed URL, issued only after the caller
 * has been checked against the event.
 */

const BUCKET = 'registration-uploads'
const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf',
])

/** What gets stored in registration_answers.answer for a file question. */
export interface FileAnswer {
    path: string
    name: string
    size: number
    type: string
}

export interface UploadTicket {
    path?: string
    token?: string
    error?: string
}

function extensionFor(type: string, fileName: string): string {
    const fromName = (fileName.match(/\.([a-z0-9]{1,5})$/i)?.[1] || '').toLowerCase()
    if (fromName) return fromName
    return type === 'application/pdf' ? 'pdf'
        : type === 'image/png' ? 'png'
            : type === 'image/webp' ? 'webp'
                : type === 'image/heic' ? 'heic'
                    : 'jpg'
}

/**
 * Mint a one-shot upload URL for a file answer.
 *
 * Deliberately callable by anonymous visitors — that is who registers. The
 * protection is not a session but the narrowness of what this grants: a single
 * path, for a question that must genuinely exist on that event and be of type
 * `file`. A caller cannot name their own path or write anywhere else.
 */
export async function createRegistrationUploadUrl(
    eventId: string,
    questionId: string,
    fileName: string,
    contentType: string,
    fileSize: number,
): Promise<UploadTicket> {
    if (!ALLOWED.has(contentType)) {
        return { error: 'That file type is not accepted. Use a JPG, PNG, WEBP, HEIC or PDF.' }
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_BYTES) {
        return { error: 'Files must be under 10MB.' }
    }

    const admin = createAdminClient()

    // The question must belong to THIS event and actually accept a file —
    // otherwise the endpoint is a free upload slot for any id someone invents.
    const { data: question } = await admin
        .from('registration_questions')
        .select('id, event_id, question_type')
        .eq('id', questionId)
        .eq('event_id', eventId)
        .maybeSingle()

    if (!question) return { error: 'That question does not belong to this event.' }
    if (question.question_type !== 'file') return { error: 'That question does not take a file.' }

    // Path is server-chosen. Grouped by event so an organizer's uploads are one
    // prefix, and random so nothing is guessable from a registration id.
    const ext = extensionFor(contentType, fileName)
    const path = `${eventId}/${questionId}/${crypto.randomUUID()}.${ext}`

    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path)
    if (error || !data) {
        console.error('createRegistrationUploadUrl failed', error)
        return { error: 'Could not start the upload. Try again.' }
    }

    return { path: data.path, token: data.token }
}

/**
 * A viewing link for an uploaded file, for the organizer.
 *
 * Gated on the acting partner owning the event — ghost seats included, so
 * platform support can open an attachment while helping. Ten minutes is long
 * enough to look at it and short enough that a copied URL is not a permanent
 * back door into the bucket.
 */
export async function getRegistrationFileUrl(
    eventId: string,
    path: string,
): Promise<{ url?: string; error?: string }> {
    const supabase = await createClient()
    const admin = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const actingPartnerId = await getActingPartnerId(user.id)
    if (!actingPartnerId) return { error: 'No partner account' }

    const { data: event } = await admin
        .from('events')
        .select('id, organizer_id')
        .eq('id', eventId)
        .maybeSingle()
    if (!event || event.organizer_id !== actingPartnerId) {
        return { error: 'Not authorized for this event' }
    }

    // The path carries the event id as its first segment. Checking it stops a
    // valid organizer from reading another event's uploads by passing a path.
    if (!path.startsWith(`${eventId}/`)) return { error: 'That file is not on this event.' }

    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 600)
    if (error || !data) {
        console.error('getRegistrationFileUrl failed', error)
        return { error: 'Could not open that file.' }
    }
    return { url: data.signedUrl }
}

/** Safely read a file answer, which is JSON held in a text column. */
export async function parseFileAnswer(raw: string | null | undefined): Promise<FileAnswer | null> {
    if (!raw || !raw.trim().startsWith('{')) return null
    try {
        const v = JSON.parse(raw)
        if (v && typeof v.path === 'string') {
            return { path: v.path, name: v.name || 'file', size: Number(v.size) || 0, type: v.type || '' }
        }
    } catch {
        // A malformed answer is a display problem, never a crash.
    }
    return null
}

/**
 * Viewing links for a whole page of responses, in one call.
 *
 * Inline thumbnails need a URL before the reader clicks anything, and a private
 * bucket has none — so the page mints them in a batch rather than firing one
 * round trip per image. The event is authorised ONCE here; paths that do not
 * belong to it are dropped rather than failing the batch, so one stale answer
 * cannot blank the whole page.
 *
 * Ten minutes: long enough to read a page of responses, short enough that a
 * copied page source stops working quickly.
 */
export async function getRegistrationFileUrls(
    eventId: string,
    paths: string[],
): Promise<Record<string, string>> {
    if (!paths?.length) return {}

    const supabase = await createClient()
    const admin = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return {}

    const actingPartnerId = await getActingPartnerId(user.id)
    if (!actingPartnerId) return {}

    const { data: event } = await admin
        .from('events')
        .select('id, organizer_id')
        .eq('id', eventId)
        .maybeSingle()
    if (!event || event.organizer_id !== actingPartnerId) return {}

    const own = Array.from(new Set(paths.filter(p => p && p.startsWith(`${eventId}/`))))
    if (!own.length) return {}

    const { data, error } = await admin.storage.from(BUCKET).createSignedUrls(own, 600)
    if (error || !data) {
        console.error('getRegistrationFileUrls failed', error)
        return {}
    }

    const out: Record<string, string> = {}
    for (const row of data) {
        // createSignedUrls reports per-path errors inline; skip those rather
        // than letting one deleted object take the page down.
        if (row.signedUrl && row.path) out[row.path] = row.signedUrl
    }
    return out
}
