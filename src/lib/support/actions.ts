'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getPartnerId } from '@/lib/auth/cached'
import { publishSupportSignal, publishSupportQueueSignal } from '@/lib/support/realtime-server'

/**
 * Organizer-side support inbox.
 *
 * Every function here goes through the caller's own session, never the service
 * role. The RLS in 20260912063854_support_inbox_threads is the authorization —
 * an organizer sees their own threads plus, if they own the partner, every
 * thread raised against it. Re-implementing that rule in TypeScript would just
 * be a second copy to drift from the first, so these read and write plainly and
 * let the database decide who gets what.
 *
 * The system is ASYNC. Nothing here reports presence or "agent is typing";
 * what the UI shows is a timestamp and an unread count, both of which are
 * written by the message trigger rather than by this file.
 */

export type SupportSender = 'requester' | 'agent' | 'system'

export interface SupportThread {
    id: string
    reference: string
    subject: string
    status: 'open' | 'pending' | 'resolved' | 'closed'
    category: string
    last_message_at: string
    last_sender: SupportSender
    organizer_unread: number
    created_at: string
}

export interface SupportAttachment {
    id: string
    file_name: string
    mime_type: string
    /** Signed, short-lived. Null when signing failed — render the name, not a dead link. */
    url: string | null
}

export interface SupportMessage {
    id: string
    sender: SupportSender
    body: string
    created_at: string
    sender_user_id: string | null
    /** Staff-only note. RLS hides these from the requester; agents see them. */
    internal: boolean
    /**
     * Retracted by its sender. The row is still here on purpose — an agent has
     * to be able to see that something WAS said. `body` is NOT sent to the
     * client when this is set.
     */
    deleted_at: string | null
    attachments: SupportAttachment[]
}

const THREAD_COLUMNS =
    'id, reference, subject, status, category, last_message_at, last_sender, organizer_unread, created_at'

/** Threads the caller can see, newest activity first. */
export async function listSupportThreads(): Promise<SupportThread[]> {
    const { user } = await getAuthUser()
    if (!user) return []

    const supabase = await createClient()
    const { data, error } = await supabase
        .from('support_tickets')
        .select(THREAD_COLUMNS)
        .order('last_message_at', { ascending: false })
        .limit(50)

    if (error) {
        console.error('listSupportThreads:', error.message)
        return []
    }
    return (data ?? []) as SupportThread[]
}

/** Total unread replies across the caller's threads — drives the bubble badge. */
export async function getSupportUnreadCount(): Promise<number> {
    const { user } = await getAuthUser()
    if (!user) return 0

    const supabase = await createClient()
    const { data, error } = await supabase
        .from('support_tickets')
        .select('organizer_unread')
        .gt('organizer_unread', 0)

    if (error) return 0
    return (data ?? []).reduce((sum, r) => sum + (r.organizer_unread ?? 0), 0)
}

/**
 * Messages on a thread.
 *
 * `includeInternal` DEFAULTS TO FALSE AND THAT IS LOAD-BEARING. RLS permits
 * internal notes to anyone `is_support_agent()` returns true for, which is a
 * statement about the PERSON, not about the screen they are on. Staff raise
 * support threads of their own — and when they do, the agent predicate is still
 * true, so the requester's own widget happily rendered staff-only notes back to
 * them. That happened on HH-1011 with notes nobody would want a customer to see.
 *
 * So the surface decides, exactly as it does for the sender of an attachment:
 * the organizer widget asks for the conversation, the agent console asks for
 * the conversation plus the notes. The database is not wrong here and its rule
 * is not being weakened — this narrows a read that was always too wide for one
 * of its two callers.
 */
export async function getSupportMessages(
    ticketId: string,
    opts?: { includeInternal?: boolean },
): Promise<SupportMessage[]> {
    const supabase = await createClient()
    let query = supabase
        .from('support_messages')
        .select(`
            id, sender, body, created_at, sender_user_id, internal, deleted_at,
            support_attachments ( id, file_name, mime_type, storage_path )
        `)
        .eq('ticket_id', ticketId)

    if (!opts?.includeInternal) query = query.eq('internal', false)

    const { data, error } = await query
        // seq, not created_at: two inserts in the same millisecond or any clock
        // skew and a wall-clock sort renders the thread out of order.
        .order('seq', { ascending: true })

    if (error) {
        console.error('getSupportMessages:', error.message)
        return []
    }

    // The bucket is private, so every file needs a signed URL. Signed in one
    // batch rather than per row: a thread with a dozen screenshots would
    // otherwise be a dozen sequential round trips before anything renders.
    const rows = (data ?? []) as any[]
    // Retraction exists to make text stop being readable. Dropping the body
    // HERE, server-side, is what makes that true — a client that renders a
    // placeholder while the string still arrived over the wire has not deleted
    // anything, it has hidden it from one renderer.
    const paths = rows
        .filter((m) => !m.deleted_at)
        .flatMap((m) => (m.support_attachments ?? []).map((a: any) => a.storage_path))

    const signed = new Map<string, string>()
    if (paths.length > 0) {
        const { data: urls } = await supabase.storage
            .from('support-attachments')
            .createSignedUrls(paths, 60 * 10)
        for (const u of urls ?? []) {
            if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl)
        }
    }

    return rows.map((m) => ({
        id: m.id,
        sender: m.sender,
        body: m.deleted_at ? '' : m.body,
        created_at: m.created_at,
        sender_user_id: m.sender_user_id,
        internal: m.internal,
        deleted_at: m.deleted_at ?? null,
        attachments: (m.deleted_at ? [] : m.support_attachments ?? []).map((a: any) => ({
            id: a.id,
            file_name: a.file_name,
            mime_type: a.mime_type,
            url: signed.get(a.storage_path) ?? null,
        })),
    })) as SupportMessage[]
}

/**
 * Open a thread. The ticket and its first message are created together by the
 * RPC — a ticket with no message would sit in the agent queue as an empty row
 * nobody can answer.
 */
export async function openSupportThread(input: {
    body: string
    category?: string
    openedFromPath?: string
}): Promise<{ id: string; reference: string } | { error: string }> {
    const { user } = await getAuthUser()
    if (!user) return { error: 'Not signed in' }

    const body = input.body?.trim()
    if (!body) return { error: 'Write a message first' }
    if (body.length > 8000) return { error: 'That message is too long' }

    const partnerId = await getPartnerId(user.id)
    const supabase = await createClient()

    const { data, error } = await supabase
        .rpc('open_support_ticket', {
            p_body: body,
            p_partner_id: partnerId,
            p_category: input.category ?? 'other',
            p_subject: null,
            p_opened_from_path: input.openedFromPath ?? null,
        })
        .single()

    if (error || !data) {
        console.error('openSupportThread:', error?.message)
        return { error: 'Could not open the conversation' }
    }

    const ticket = data as { id: string; reference: string }
    // Advisory, fire-and-forget. The ticket exists whether or not this lands.
    publishSupportSignal(ticket.id)
    // Nobody is subscribed to a thread that did not exist a second ago, so the
    // per-ticket publish above reaches no one. This is what tells the console.
    publishSupportQueueSignal(ticket.id)

    revalidatePath('/organizer')
    return ticket
}

/**
 * Reply on an existing thread. `sender` is asserted here but the RLS policy is
 * what enforces it — an organizer inserting sender:'agent' is rejected by the
 * database, not by this function.
 */
export async function replyToSupportThread(
    ticketId: string,
    body: string,
): Promise<{ ok: true } | { error: string }> {
    const { user } = await getAuthUser()
    if (!user) return { error: 'Not signed in' }

    const text = body?.trim()
    if (!text) return { error: 'Write a message first' }
    if (text.length > 8000) return { error: 'That message is too long' }

    const supabase = await createClient()
    const { error } = await supabase.from('support_messages').insert({
        ticket_id: ticketId,
        sender: 'requester',
        sender_user_id: user.id,
        body: text,
    })

    if (error) {
        console.error('replyToSupportThread:', error.message)
        // RLS refuses the insert without saying why, and "closed" is only ONE of
        // the reasons. Ask which it was rather than asserting the likely one —
        // telling someone their conversation is closed when the real problem was
        // a dropped connection sends them off to open a duplicate ticket.
        const { data: canReply } = await supabase.rpc('can_reply_support_ticket', {
            p_ticket_id: ticketId,
        })
        return canReply === false
            ? { error: 'This conversation is closed. Start a new one and we\'ll pick it up.' }
            : { error: 'That didn\'t send. Try again in a moment.' }
    }

    publishSupportSignal(ticketId)
    // Also the doorbell: replying to a RESOLVED thread reopens it, and a console
    // filtered to the inbox was not watching that thread's channel.
    publishSupportQueueSignal(ticketId)
    return { ok: true }
}

export async function markSupportThreadRead(ticketId: string): Promise<void> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('mark_support_read', { p_ticket_id: ticketId })
    if (error) console.error('markSupportThreadRead:', error.message)
}

/**
 * Attach a screenshot.
 *
 * The file becomes a MESSAGE, not a row hanging off the ticket. An attachment
 * with no message moves nothing — no unread count, no notification, no line in
 * the conversation — which is what the first cut of this did: an organizer
 * could upload a screenshot that nobody, including the agent, could ever see.
 *
 * THREE FACTS THAT DECIDE THE ORDER HERE:
 *   1. support_messages has no DELETE policy (append-only, correctly).
 *   2. storage.objects has no DELETE policy for this bucket either.
 *   3. So there is no compensating delete available. Anything written by a step
 *      that later fails stays written.
 *
 * Hence: ask permission first, upload second, and make the two database rows in
 * ONE transaction last. The common failure — a closed thread — is caught by the
 * pre-check before a byte reaches storage. The residual failure is a database
 * error after a successful upload, which leaves an unreferenced object in a
 * private bucket: unreadable through the app, and not something the user sees.
 *
 * Storage path is `<ticket_id>/<uuid>.<ext>` because the bucket policy reads the
 * ticket id out of the first path segment — putting the file anywhere else means
 * it cannot be read back, including by us.
 */
export async function uploadSupportAttachment(
    ticketId: string,
    file: File,
): Promise<{ ok: true } | { error: string }> {
    const { user } = await getAuthUser()
    if (!user) return { error: 'Not signed in' }

    const MAX = 10 * 1024 * 1024
    if (file.size > MAX) return { error: 'Files must be under 10MB' }

    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']
    if (!allowed.includes(file.type)) return { error: 'Images and PDFs only' }

    const supabase = await createClient()

    // The same predicate RLS will apply, asked up front so a closed thread is
    // refused before anything is stored.
    const { data: canReply } = await supabase.rpc('can_reply_support_ticket', { p_ticket_id: ticketId })
    if (canReply !== true) {
        return { error: 'This conversation is closed. Start a new one and we\'ll pick it up.' }
    }

    const name = file.name.slice(0, 200)
    const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
    const path = `${ticketId}/${crypto.randomUUID()}.${ext}`

    const { error: uploadError } = await supabase.storage
        .from('support-attachments')
        .upload(path, file, { contentType: file.type, upsert: false })

    if (uploadError) {
        console.error('uploadSupportAttachment:', uploadError.message)
        return { error: 'Upload failed' }
    }

    // Message and attachment row together, or neither.
    const { error: rpcError } = await supabase.rpc('attach_support_file', {
        p_ticket_id: ticketId,
        p_storage_path: path,
        p_file_name: name,
        p_mime_type: file.type,
        p_size_bytes: file.size,
        // The surface says who is speaking, not the role. Staff are organizers
        // too — an admin uploading here is asking for help, not answering it.
        p_sender: 'requester',
    })

    if (rpcError) {
        // Nothing to roll back to — see the note above. The object is orphaned
        // in a private bucket and no row points at it.
        console.error('attach_support_file:', rpcError.message)
        return { error: 'Upload failed' }
    }

    publishSupportSignal(ticketId)
    publishSupportQueueSignal(ticketId)
    return { ok: true }
}

/**
 * Take back one of your own messages.
 *
 * Requester-only, and a retraction rather than an edit — see the migration
 * 20260913060000 for why an agent cannot do this and why editing is not
 * offered to anyone.
 *
 * Two-step by necessity: the database can detach the attachment rows but
 * cannot reach into object storage, so the RPC hands back the paths and this
 * purges them. The order matters — the rows go first, so no signed URL can be
 * issued for the file even in the window before the object is gone.
 */
export async function retractSupportMessage(
    messageId: string,
): Promise<{ ok: true } | { error: string }> {
    const { user } = await getAuthUser()
    if (!user) return { error: 'Not signed in' }

    const supabase = await createClient()

    // Read the thread first so the realtime signal below has somewhere to go.
    const { data: owningMessage } = await supabase
        .from('support_messages')
        .select('ticket_id')
        .eq('id', messageId)
        .maybeSingle()

    const { data: paths, error } = await supabase.rpc('retract_support_message', {
        p_message_id: messageId,
    })

    if (error) {
        console.error('retractSupportMessage:', error.message)
        return { error: 'Could not remove that message' }
    }

    if (Array.isArray(paths) && paths.length > 0) {
        const { error: purgeError } = await supabase.storage
            .from('support-attachments')
            .remove(paths as string[])
        // The message is already retracted and the rows are gone, so the file is
        // unreachable through the app either way. Say so in the log rather than
        // telling someone their deletion failed when the visible part worked.
        if (purgeError) console.error('retractSupportMessage purge:', purgeError.message)
    }

    // Tell the agent console at once. Someone retracting a pasted secret should
    // not have it sitting on another screen until that screen happens to poll.
    if (owningMessage?.ticket_id) publishSupportSignal(owningMessage.ticket_id)
    return { ok: true }
}
