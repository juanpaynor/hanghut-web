'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { throwOnServer } from './actions'

export function SentryTestButtons() {
    const [note, setNote] = useState<string | null>(null)
    const [boom, setBoom] = useState(false)

    // Thrown during render, which is what global-error.tsx exists to catch —
    // the path the build warned was unhandled.
    if (boom) throw new Error('Sentry test: client render error')

    return (
        <div className="flex flex-col gap-3">
            <Button
                variant="outline"
                onClick={async () => {
                    setNote(null)
                    try {
                        await throwOnServer()
                    } catch (e) {
                        // A server action's error reaches the client as an opaque
                        // digest. Sentry sees the real one via onRequestError.
                        setNote(`Server threw as expected: ${e instanceof Error ? e.message : String(e)}`)
                    }
                }}
            >
                Throw in a server action
            </Button>

            <Button
                variant="outline"
                onClick={() => {
                    // Unhandled rejection — caught by the browser SDK's global
                    // handlers rather than any boundary.
                    setNote('Threw an unhandled async error — check Sentry.')
                    setTimeout(() => { throw new Error('Sentry test: client async error') }, 0)
                }}
            >
                Throw in the browser (async)
            </Button>

            <Button variant="destructive" onClick={() => setBoom(true)}>
                Crash the page (tests global-error)
            </Button>

            {note && <p className="text-sm text-muted-foreground">{note}</p>}
        </div>
    )
}
