'use server'

/** Throws on purpose. Reported by instrumentation.ts's onRequestError hook —
 *  the same path a failing updateEvent takes. */
export async function throwOnServer(): Promise<never> {
    throw new Error('Sentry test: server action error')
}
