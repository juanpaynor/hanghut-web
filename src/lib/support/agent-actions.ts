'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/auth/cached'
import { publishSupportSignal } from '@/lib/support/realtime-server'

/**
 * Agent-side support queue, behind /admin — which already enforces the admin
 * role and an 8-hour MFA window, so nothing here re-checks the session beyond
 * confirming there is one. The database re-checks anyway: every write below
 * either passes through RLS or through a definer RPC that calls
 * is_support_agent() itself.
 *
 * One queue for both sources. `source` distinguishes an organizer raising a
 * thread from the web dashboard from a user raising one in the app, and the
 * agent looks in exactly one place either way.
 */

export interface AgentThread {
    id: string
    reference: string
    subject: string
    status: string
    category: string
    source: string
    priority: string | null
    last_message_at: string
    last_sender: string
    agent_unread: number
    assigned_to: string | null
    opened_from_path: string | null
    created_at: string
    user_email: string | null
    user_display_name: string | null
    partner: { business_name: string | null; slug: string | null } | null
}

const AGENT_COLUMNS = `
    id, reference, subject, status, category, source, priority,
    last_message_at, last_sender, agent_unread, assigned_to, opened_from_path,
    created_at, user_email, user_display_name,
    partner:partners ( business_name, slug )
`

export async function listAgentThreads(filter: 'inbox' | 'mine' | 'resolved' = 'inbox') {
    const { user } = await getAuthUser()
    if (!user) return [] as AgentThread[]

    const supabase = await createClient()
    let query = supabase
        .from('support_tickets')
        .select(AGENT_COLUMNS)
        // Account appeals share this table but are not threads: the app writes
        // them from its suspended-account screen with the text in the legacy
        // `message` column and NO support_messages row, so they would render
        // here as conversations with nothing in them. They are answered at
        // /admin/tickets, which owns the part that makes them different —
        // approve, deny, reactivate the account — and which now emails the
        // decision, since a suspended user has no other way to receive it.
        .eq('ticket_type', 'support')
        .order('last_message_at', { ascending: false })
        .limit(100)

    if (filter === 'inbox') query = query.in('status', ['open', 'pending'])
    else if (filter === 'mine') query = query.eq('assigned_to', user.id).in('status', ['open', 'pending'])
    else query = query.in('status', ['resolved', 'closed'])

    const { data, error } = await query
    if (error) {
        console.error('listAgentThreads:', error.message)
        return [] as AgentThread[]
    }
    return (data ?? []) as unknown as AgentThread[]
}

export async function replyAsAgent(
    ticketId: string,
    body: string,
    internal = false,
): Promise<{ ok: true } | { error: string }> {
    const { user } = await getAuthUser()
    if (!user) return { error: 'Not signed in' }

    const text = body?.trim()
    if (!text) return { error: 'Write a reply first' }
    if (text.length > 8000) return { error: 'That reply is too long' }

    const supabase = await createClient()

    // Read ownership before writing, so the claim below can tell "nobody has
    // this" from "someone else does".
    const { data: before } = await supabase
        .from('support_tickets')
        .select('assigned_to')
        .eq('id', ticketId)
        .maybeSingle()

    const { error } = await supabase.from('support_messages').insert({
        ticket_id: ticketId,
        sender: 'agent',
        sender_user_id: user.id,
        body: text,
        internal,
    })

    if (error) {
        console.error('replyAsAgent:', error.message)
        return { error: 'Could not send the reply' }
    }

    // CLAIM ON REPLY. Answering a thread is what taking it means, so record
    // that rather than making an agent remember to press Claim first — which
    // nobody does, which is why "Mine" stays empty and two people end up
    // writing the same answer.
    //
    // This is the only auto-assignment worth having at four agents. Round-robin
    // would assign by position in a list rather than by who is free, and a
    // ticket owned by someone in a meeting reads as taken — so everyone else
    // skips it. That turns "nobody picked this up", which is visible in the
    // queue, into "someone owns this and is not working it", which is not.
    //
    // Only ever fills an EMPTY owner. It never takes a thread off a colleague
    // who is already on it — adding a second voice to someone else's
    // conversation is a thing an agent should have to do deliberately.
    if (!before?.assigned_to) {
        const { error: claimError } = await supabase.rpc('assign_support_ticket', {
            p_ticket_id: ticketId,
            p_assignee: user.id,
        })
        // The reply is sent either way. An unassigned thread is untidy; a reply
        // that failed because the tidying did is not.
        if (claimError) console.error('replyAsAgent claim:', claimError.message)
    }

    // Email is the transport that actually reaches an organizer in an async
    // system — nobody sits in the dashboard waiting. Deliberately not awaited
    // into the result: a Resend outage must not make the agent think their
    // reply failed, because the reply is already saved and visible in-app.
    //
    // An internal note is a note to ourselves. Emailing it to the person it is
    // about would be the exact leak the `internal` flag exists to prevent.
    if (!internal) {
        void notifyOrganizer(ticketId)
        // Same reasoning as the email: an internal note is ours. Signalling it
        // would have the requester's client refetch and find nothing new — RLS
        // hides the note — but it would still tell them, by timing alone, that
        // their ticket is being discussed right now.
        publishSupportSignal(ticketId)
    }

    revalidatePath('/admin/support')
    return { ok: true }
}

/**
 * Fire the notification email. Passes only the ticket id — the edge function
 * resolves the recipient and the body itself and refuses any bearer that is
 * not the service-role key, so this is the only way to reach it.
 */
async function notifyOrganizer(ticketId: string, kind: 'reply' | 'transcript' = 'reply'): Promise<void> {
    try {
        const admin = createAdminClient()
        const { error } = await admin.functions.invoke('send-support-notification', {
            body: { ticket_id: ticketId, kind },
        })
        if (error) console.error('notifyOrganizer:', error.message)
    } catch (e) {
        console.error('notifyOrganizer:', e)
    }
}

export async function setThreadStatus(
    ticketId: string,
    status: 'open' | 'pending' | 'resolved' | 'closed',
): Promise<{ ok: true } | { error: string }> {
    const supabase = await createClient()

    // Read the status we are leaving, so wrapping up can be told apart from
    // re-wrapping something already wrapped. Without this, an agent nudging a
    // resolved thread to closed would mail the organizer the same transcript a
    // second time.
    const { data: before } = await supabase
        .from('support_tickets')
        .select('status')
        .eq('id', ticketId)
        .maybeSingle()

    const { error } = await supabase.rpc('set_support_ticket_status', {
        p_ticket_id: ticketId,
        p_status: status,
    })
    if (error) {
        console.error('setThreadStatus:', error.message)
        return { error: 'Could not update the status' }
    }

    // The conversation just ended. Send the whole thing — internal notes
    // excluded — so the organizer keeps a copy outside a dashboard they may
    // never open again. Not awaited, for the same reason a reply email is not:
    // a Resend outage must not read to the agent as a failed status change.
    const TERMINAL = ['resolved', 'closed']
    if (TERMINAL.includes(status) && !TERMINAL.includes(before?.status ?? '')) {
        void notifyOrganizer(ticketId, 'transcript')
    }
    // Status is the one non-message change a requester needs promptly: closing
    // a thread is what turns their reply box into "start a new ticket".
    publishSupportSignal(ticketId)
    revalidatePath('/admin/support')
    return { ok: true }
}

/** Claim a thread, or hand it back by passing null. */
export async function assignThread(
    ticketId: string,
    assignee: string | null,
): Promise<{ ok: true } | { error: string }> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('assign_support_ticket', {
        p_ticket_id: ticketId,
        p_assignee: assignee,
    })
    if (error) {
        console.error('assignThread:', error.message)
        return { error: 'Could not assign' }
    }
    revalidatePath('/admin/support')
    return { ok: true }
}

/**
 * Priority is an agent's call, never the requester's — a self-service "urgent"
 * button makes every ticket urgent inside a week. The database re-checks
 * is_support_agent() regardless.
 */
export async function setThreadPriority(
    ticketId: string,
    priority: 'low' | 'normal' | 'high' | 'urgent',
): Promise<{ ok: true } | { error: string }> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('set_support_ticket_priority', {
        p_ticket_id: ticketId,
        p_priority: priority,
    })
    if (error) {
        console.error('setThreadPriority:', error.message)
        return { error: 'Could not change priority' }
    }
    revalidatePath('/admin/support')
    return { ok: true }
}

export async function claimThread(ticketId: string) {
    const { user } = await getAuthUser()
    if (!user) return { error: 'Not signed in' as const }
    return assignThread(ticketId, user.id)
}
