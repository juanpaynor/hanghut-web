/**
 * Server-Timing instrumentation for the public API.
 *
 * Black-box benchmarking took us as far as "a database round trip from the
 * function costs ~156ms, inside the same region, for a query that executes in
 * 0.082ms". Region pinning, payload size, query plans and middleware were all
 * ruled out from outside, and the remaining candidates — TLS handshake on cold
 * instances, Cloudflare edge routing for server-originated requests, Supabase
 * gateway time, cold-start attribution — are indistinguishable from a client.
 *
 * So measure from inside. Every response carries a Server-Timing header naming
 * each awaited step, which browsers show natively in the network panel and
 * `curl -D -` shows as text.
 *
 * Cost is a Date.now() per span. Nothing here is conditional on an env var: an
 * instrument you have to remember to switch on is one that is off when you need
 * it, and Server-Timing exposes no data — only durations.
 */

export class Timer {
    private readonly start = Date.now()
    private readonly spans: Array<{ name: string; dur: number }> = []

    /**
     * Time an awaited step and record it under `name`.
     *
     * PromiseLike, not Promise: supabase-js query builders are thenables, not
     * real Promises, and typing this as Promise would reject them.
     */
    async span<T>(name: string, fn: () => PromiseLike<T>): Promise<T> {
        const t0 = Date.now()
        try {
            return await fn()
        } finally {
            this.spans.push({ name, dur: Date.now() - t0 })
        }
    }

    /** Record a duration measured elsewhere (e.g. inside a helper that timed itself). */
    add(name: string, dur: number) {
        this.spans.push({ name, dur })
    }

    /** Absorb spans recorded by a nested Timer, keeping their names. */
    merge(other: Timer) {
        this.spans.push(...other.spans)
    }

    /**
     * `Server-Timing` value. `total` is wall time for the whole handler, so the
     * gap between it and the sum of the named spans is the un-instrumented
     * remainder — serialization, framework overhead, and anything not yet timed.
     */
    header(): string {
        const parts = this.spans.map(s => `${s.name};dur=${s.dur}`)
        parts.push(`total;dur=${Date.now() - this.start}`)
        return parts.join(', ')
    }
}
