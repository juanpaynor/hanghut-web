'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

/**
 * Last-resort boundary for React rendering errors in the App Router.
 *
 * There was no error boundary anywhere in src/app, so a render error fell
 * through to Next's default page AND — once Sentry shipped — went unreported,
 * which the build warned about. That is the worst combination: the user sees a
 * blank failure and we learn nothing, the exact situation the event-save
 * investigation ran into.
 *
 * global-error REPLACES the root layout when it fires, so this file owns its
 * own <html> and <body> and cannot rely on anything from layout.tsx — no
 * fonts, no providers, no globals.css guarantees. Styling is therefore inline
 * and deliberately plain: a boundary that needs the app to be working is not a
 * boundary. It keeps the 404 page's ground colour so it still reads as ours.
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        Sentry.captureException(error)
    }, [error])

    return (
        <html lang="en">
            <body style={{ margin: 0, backgroundColor: '#FAFAF8' }}>
                <div style={{
                    minHeight: '100dvh', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24,
                    textAlign: 'center',
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
                    color: '#17152f',
                }}>
                    <div style={{ fontSize: 40, lineHeight: 1 }}>🎟️</div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>
                        Something broke on our side
                    </h1>
                    <p style={{ margin: 0, maxWidth: 420, fontSize: 15, lineHeight: 1.6, color: '#5b5878' }}>
                        This page failed to load. It has been reported to us automatically.
                        Nothing you were doing was saved, so it is safe to try again.
                    </p>

                    <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                        <button
                            onClick={() => reset()}
                            style={{
                                padding: '11px 22px', borderRadius: 10, border: 'none',
                                background: '#4f46e5', color: '#fff', fontSize: 15,
                                fontWeight: 600, cursor: 'pointer',
                            }}
                        >
                            Try again
                        </button>
                        <a
                            href="/"
                            style={{
                                padding: '11px 22px', borderRadius: 10,
                                border: '1px solid #e4e3ec', background: '#fff',
                                color: '#17152f', fontSize: 15, fontWeight: 600,
                                textDecoration: 'none',
                            }}
                        >
                            Go home
                        </a>
                    </div>

                    {/* The digest is how an unreadable minified stack gets matched to
                        the real one in the logs. Showing it means a partner can quote
                        it in a support message instead of describing a blank page. */}
                    {error.digest && (
                        <p style={{ margin: '12px 0 0', fontSize: 12, color: '#8a87a4' }}>
                            Reference: {error.digest}
                        </p>
                    )}
                </div>
            </body>
        </html>
    )
}
