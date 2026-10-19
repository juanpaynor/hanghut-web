import * as Sentry from '@sentry/nextjs'
import { scrubEvent } from './src/lib/observability/sentry-scrub'

// Middleware and edge routes. Same posture as the server config.
Sentry.init({
    dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
})
