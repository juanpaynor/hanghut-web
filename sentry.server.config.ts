import * as Sentry from '@sentry/nextjs'
import { scrubEvent } from './src/lib/observability/sentry-scrub'

/**
 * Server-side error reporting.
 *
 * DSN comes from the environment and nothing else. With it unset the SDK is a
 * no-op, so merging this changes nothing until SENTRY_DSN is set in Vercel —
 * which is deliberate: this is a money-path app and a reporting layer should
 * not switch itself on as a side effect of a deploy.
 */
Sentry.init({
    dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,

    // Errors are the point. Tracing is a separate, metered decision and starts
    // off; turn it up deliberately once the error signal is understood.
    tracesSampleRate: 0,

    // Off, always. See sentry-scrub: this app carries buyer emails, medical
    // answers and ticket tokens, and none of it belongs in an issue tracker.
    sendDefaultPii: false,

    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
})
