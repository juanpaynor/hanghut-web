import { notFound } from 'next/navigation'
import { SentryTestButtons } from './buttons'

/**
 * Proves the app's own Sentry wiring, as opposed to Sentry's ingestion.
 *
 * Those are two different things and only the second is worth much: an event
 * posted straight to the DSN with curl shows the project accepts events, but
 * says nothing about whether THIS app initialises the SDK, in which runtimes,
 * or whether the scrubber runs. This page throws real errors through the real
 * code paths instead.
 *
 * GATED, and inert by default. With SENTRY_TEST_KEY unset — which is how it
 * ships — the route 404s like any unknown path, so a page whose entire purpose
 * is to crash cannot be stumbled into. Set the variable when you want to test,
 * remove it when you are done.
 */
export const dynamic = 'force-dynamic'

export const metadata = { robots: { index: false, follow: false } }

export default async function SentryTestPage({
    searchParams,
}: {
    searchParams: Promise<{ key?: string }>
}) {
    const expected = process.env.SENTRY_TEST_KEY
    const { key } = await searchParams

    // No key configured means the door does not exist, not that it is locked.
    if (!expected || key !== expected) notFound()

    const dsnConfigured = Boolean(
        process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
    )

    return (
        <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 p-6">
            <div>
                <h1 className="text-xl font-semibold">Sentry wiring test</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    Each button throws a real error through a real code path. Check
                    the <strong>web</strong> project in Sentry afterwards — events
                    usually land within a minute.
                </p>
            </div>

            <div className="rounded-lg border p-3 text-sm">
                <span className="text-muted-foreground">Server DSN: </span>
                {dsnConfigured
                    ? <span className="font-medium text-emerald-600">configured</span>
                    : <span className="font-medium text-amber-600">
                        missing — server errors will NOT be reported
                      </span>}
            </div>

            <SentryTestButtons />

            <p className="text-xs text-muted-foreground">
                The browser DSN is inlined at build time, so if client errors do not
                arrive, check that NEXT_PUBLIC_SENTRY_DSN was set before the build
                that produced this deploy — not just before the deploy.
            </p>
        </div>
    )
}
