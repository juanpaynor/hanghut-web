/**
 * Publishes ONE support realtime signal, exactly as the server does.
 *
 *   node scripts/support-ping.js <ticketId>
 *
 * This exists because the whole support realtime path is fail-silent by design:
 * a missing key, a bad token, a wrong channel name and "nothing has happened
 * yet" all look identical from the outside. This splits the two halves.
 *
 *   widget refreshes when you run this  -> SUBSCRIBE works, PUBLISH is broken
 *                                          (the server action never reached Ably)
 *   nothing happens                     -> SUBSCRIBE is broken
 *                                          (token, capability, or channel name)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const Ably = require('ably')

const ticketId = process.argv[2]
if (!ticketId) {
    console.error('usage: node scripts/support-ping.js <ticketId>')
    process.exit(1)
}

// Same derivation as src/lib/support/realtime.ts — the anon key's ref claim,
// not the URL, because the URL is a custom domain here.
function scope() {
    const k = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    const parts = k.split('.')
    if (parts.length === 3) {
        try {
            const p = JSON.parse(Buffer.from(parts[1], 'base64').toString())
            if (p.ref) return p.ref
        } catch { /* fall through */ }
    }
    const m = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').match(/^https?:\/\/([a-z0-9-]+)\./i)
    return m ? m[1] : 'unknown'
}

const channel = `hh:${scope()}:support:${ticketId}`
const queue = `hh:${scope()}:support:queue`

;(async () => {
    if (!process.env.ABLY_API_KEY) {
        console.error('ABLY_API_KEY is not set — which is itself the answer.')
        process.exit(1)
    }
    const rest = new Ably.Rest({ key: process.env.ABLY_API_KEY })
    await rest.channels.get(channel).publish('message', { ticketId })
    await rest.channels.get(queue).publish('message', { ticketId })
    console.log('published to:')
    console.log('  ' + channel)
    console.log('  ' + queue)
})()
