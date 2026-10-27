import { redirect } from 'next/navigation'

// Consolidated — all consumer auth goes through /account/login.
//
// `searchParams` is a Promise. Next 15 made it one and kept a sync
// compatibility shim; Next 16 removes the shim outright. Reading `.next` off
// the un-awaited Promise would NOT crash — it yields undefined, the `||`
// fallback swallows it, and every post-login redirect silently lands on
// /experiences instead of where the buyer was going. A broken redirect that
// still returns 200 is the kind that never gets reported.
export default async function ExperienceLoginPage({
    searchParams,
}: {
    searchParams: Promise<{ next?: string }>
}) {
    const { next } = await searchParams
    redirect(`/account/login?next=${encodeURIComponent(next || '/experiences')}`)
}
