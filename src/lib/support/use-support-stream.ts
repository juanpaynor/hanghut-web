'use client'

import { useEffect, useRef } from 'react'
import { supportChannel, supportQueueChannel } from './realtime'

/**
 * Subscribe to support-thread signals over Ably.
 *
 * Native EventSource against Ably's SSE endpoint, NOT the Ably SDK — the same
 * choice the seat-map picker made, for the same reasons: the SDK ships prebuilt
 * bundles Next's SWC loader cannot parse, and we would be pulling in a
 * websocket client, presence, history and encryption to receive a one-field
 * message. EventSource costs no bundle, reconnects on its own, and cannot
 * publish even in principle.
 *
 * The payload is deliberately empty of content (see realtime.ts). This hook
 * therefore hands the caller a ticket id and nothing else; the caller refetches
 * from Postgres. Nothing off this wire is ever rendered.
 *
 * Entirely advisory. If the token call fails, the key is missing, or the socket
 * never connects, the thread still shows every message when it is opened and
 * the email notification still goes out. Failures here are swallowed on
 * purpose.
 *
 * @param ticketIds threads to watch; null/empty disables the subscription
 * @param agent     true for the admin queue. Takes one namespace-wide token
 *                  instead of one per thread, AND adds the queue channel — the
 *                  doorbell that announces threads this console has never heard
 *                  of, which by definition cannot be in `ticketIds`.
 */
export function useSupportStream(
    ticketIds: string[] | null,
    onSignal: (ticketId: string) => void,
    agent = false,
) {
    // Keep the callback in a ref so a caller that redefines it inline does not
    // tear down and rebuild the connection on every render.
    const handler = useRef(onSignal)
    handler.current = onSignal

    // One EventSource can carry many channels. Capped because the channel list
    // travels in the query string, and an agent queue of 100 threads would push
    // the URL past what proxies reliably accept. Beyond the cap the console
    // still refreshes on its own actions and on reload.
    const ids = (ticketIds ?? []).filter(Boolean).slice(0, 40)
    // Sorted so a re-ordered queue — which happens on every incoming message,
    // since the list is ordered by last_message_at — does not look like a
    // different set and reconnect.
    const key = [...ids].sort().join(',')

    useEffect(() => {
        // An agent console with an empty queue still needs the doorbell — that is
        // exactly the console that is waiting for a first ticket.
        if (!key && !agent) return
        let cancelled = false
        let stream: EventSource | null = null

        void (async () => {
            try {
                const url = agent
                    ? '/api/support/realtime-token'
                    : `/api/support/realtime-token?ticketId=${encodeURIComponent(key.split(',')[0])}`
                const res = await fetch(url)
                if (!res.ok) {
                    // This transport swallows everything by design, which makes
                    // "nothing arrives" indistinguishable from "nothing
                    // happened". One line in dev is the difference between a
                    // five-minute diagnosis and an afternoon.
                    if (process.env.NODE_ENV !== 'production') {
                        console.warn('[support realtime] token request failed:', res.status)
                    }
                    return
                }
                if (cancelled) return
                const { token } = await res.json()
                if (!token || cancelled) return

                const channels = [
                    ...(key ? key.split(',').map(supportChannel) : []),
                    ...(agent ? [supportQueueChannel()] : []),
                ].join(',')
                stream = new EventSource(
                    `https://realtime.ably.io/sse?v=1.2`
                    + `&channels=${encodeURIComponent(channels)}`
                    + `&accessToken=${encodeURIComponent(token)}`
                )

                stream.onerror = () => {
                    if (process.env.NODE_ENV !== 'production') {
                        console.warn('[support realtime] stream error; EventSource will retry')
                    }
                }

                stream.onmessage = (ev: MessageEvent) => {
                    try {
                        const envelope = JSON.parse(ev.data)
                        // Ably SSE wraps the message; `data` is the published
                        // payload, itself JSON-encoded.
                        const payload = typeof envelope.data === 'string'
                            ? JSON.parse(envelope.data)
                            : envelope.data
                        const id = payload?.ticketId
                        if (typeof id !== 'string') return

                        // An agent takes any id. The whole point of the queue
                        // channel is to name a thread this console has never
                        // seen, so an "is it in our list?" test would discard
                        // precisely the signals it exists to deliver — and an
                        // agent may read every ticket anyway, so accepting one
                        // grants nothing.
                        //
                        // A requester keeps the strict test: a forged publish
                        // should not be able to steer their client at threads it
                        // did not open.
                        if (agent || ids.includes(id)) handler.current(id)
                    } catch { /* malformed frame: the next open still reconciles */ }
                }
            } catch {
                /* advisory transport: the thread refetches on open */
            }
        })()

        return () => {
            cancelled = true
            try { stream?.close() } catch { /* noop */ }
        }
        // `ids` is derived from `key`, so `key` alone decides when to reconnect.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, agent])
}
