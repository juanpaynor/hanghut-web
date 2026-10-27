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

    // NOTE: `sendDefaultPii: false` used to sit here. Sentry v11 removed the
    // option entirely -- it is not in @sentry/core's options type and nothing
    // reads it at runtime, so it was dead config that only produced a type
    // error. The guard that actually matters is `beforeSend: scrubEvent`
    // below: this app carries buyer emails, medical answers and ticket tokens,
    // and sentry-scrub strips them from every event before it leaves.

    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
})
