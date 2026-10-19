import * as Sentry from '@sentry/nextjs'

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        await import('./sentry.server.config')
    }
    if (process.env.NEXT_RUNTIME === 'edge') {
        await import('./sentry.edge.config')
    }
}

/**
 * The hook that makes SERVER ACTIONS visible.
 *
 * Next reports a thrown server action to the client as an opaque digest, and
 * without this nothing records what actually threw — which is exactly how a
 * partner's "failed to save event" left no trace anywhere.
 */
export const onRequestError = Sentry.captureRequestError
