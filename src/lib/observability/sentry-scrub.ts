/**
 * Scrubbing for anything we send to Sentry.
 *
 * This product puts CREDENTIALS IN URLS. `/t/<token>` is a buyer's hosted
 * ticket page, `/x/<token>` the experience equivalent, and `/d/<token>` opens —
 * and edits — every attendee's registration answers on an order, which on a
 * race event means medical conditions and emergency contacts. Those tokens are
 * long-lived and are the only thing protecting that data.
 *
 * An error reporter that captures request URLs verbatim would therefore copy
 * working credentials into a third-party system, where they would sit in issue
 * titles and breadcrumbs for anyone with Sentry access. So the token is
 * replaced before anything leaves the process. The path shape is kept, because
 * knowing the failure was on /d/ is the useful part; the token never is.
 */

const TOKEN_PATHS = ['t', 'x', 'd', 's', 'r', 'm']

/** `/d/9398e8a3-...` → `/d/[token]`, in a URL or anywhere in free text. */
export function scrubTokens(input: string): string {
    let out = input
    for (const p of TOKEN_PATHS) {
        out = out.replace(
            new RegExp(`(/${p}/)[A-Za-z0-9._~-]{8,}`, 'g'),
            `$1[token]`,
        )
    }
    // Bare UUIDs in query strings (access_token=..., token=...).
    out = out.replace(
        /([?&](?:access_token|token|key|secret|apikey|api_key)=)[^&\s]+/gi,
        '$1[redacted]',
    )
    return out
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Applied to every event. Deliberately conservative: it is far cheaper to lose
 * a little debugging detail than to leak a ticket token into an issue title.
 */
export function scrubEvent(event: any): any {
    try {
        if (event.request?.url) event.request.url = scrubTokens(event.request.url)
        // Never ship cookies or auth headers, whatever sendDefaultPii says.
        if (event.request) {
            delete event.request.cookies
            if (event.request.headers) {
                delete event.request.headers.cookie
                delete event.request.headers.authorization
                delete event.request.headers.apikey
            }
        }
        if (typeof event.message === 'string') event.message = scrubTokens(event.message)
        if (Array.isArray(event.breadcrumbs)) {
            for (const b of event.breadcrumbs) {
                if (typeof b?.message === 'string') b.message = scrubTokens(b.message)
                if (typeof b?.data?.url === 'string') b.data.url = scrubTokens(b.data.url)
            }
        }
        for (const ex of event.exception?.values ?? []) {
            if (typeof ex?.value === 'string') ex.value = scrubTokens(ex.value)
        }
    } catch {
        // Scrubbing must never be the reason an error goes unreported.
    }
    return event
}
