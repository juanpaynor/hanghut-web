import * as Sentry from '@sentry/nextjs'
import { scrubEvent } from './src/lib/observability/sentry-scrub'

/**
 * Browser-side reporting.
 *
 * This is the half that would have caught the event-save failure: that error
 * was thrown in the browser and written only to the partner's own console,
 * which is why nobody could say what went wrong.
 *
 * The DSN here is public by design (it only permits sending), but it still
 * has to be a NEXT_PUBLIC_ var to reach the browser at all.
 */
Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
