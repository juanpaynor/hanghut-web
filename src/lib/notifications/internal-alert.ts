import 'server-only'
import { createClient } from '@/lib/supabase/server'

/**
 * Email the HangHut team.
 *
 * Goes through the `notify_internal_alert` SQL function rather than calling the
 * edge function directly, because that function holds the shared secret the
 * `send-internal-alert` endpoint expects. Putting that secret in web code would
 * ship it to anyone who reads a server bundle.
 *
 * Recipients live in the edge function's ALERT_RECIPIENTS secret, defaulting to
 * contact@hanghut.com plus the three staff addresses — so changing who gets
 * alerted never touches this file.
 *
 * Fire and forget by design, twice over: the SQL function uses pg_net and
 * swallows its own exceptions, and the caller here never awaits a failure into
 * the user's path. An alert that does not send must never be the reason a
 * partner's submission fails.
 */
export type InternalAlertType =
    | 'partner_signup'
    | 'payout_request'
    | 'report'
    | 'status_update'
    | 'custom'

export async function notifyInternalAlert(input: {
    type: InternalAlertType
    subject: string
    bodyHtml: string
    metadata?: Record<string, string | number | null | undefined>
}): Promise<void> {
    try {
        const supabase = await createClient()
        await supabase.rpc('notify_internal_alert', {
            p_type: input.type,
            p_subject: input.subject,
            p_body_html: input.bodyHtml,
            p_metadata: Object.fromEntries(
                Object.entries(input.metadata ?? {})
                    .filter(([, v]) => v !== null && v !== undefined && v !== '')
                    .map(([k, v]) => [k, String(v)]),
            ),
        })
    } catch (e) {
        // Never rethrow. The caller is on a user's submission path.
        console.error('[internal-alert] failed to queue:', e)
    }
}

/**
 * Escape before interpolating ANYTHING a partner typed into the alert body.
 *
 * The body is rendered as HTML in a staff inbox, and the title, description and
 * location of an experience are all free text supplied by whoever submitted it.
 * Without this, a submission titled `<img src=x onerror=...>` is a payload
 * delivered straight to the people with admin access.
 */
export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}
