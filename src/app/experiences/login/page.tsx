import { redirect } from 'next/navigation'

// Consolidated — all consumer auth goes through /account/login
export default function ExperienceLoginPage({
    searchParams,
}: {
    searchParams: { next?: string }
}) {
    const next = searchParams.next || '/experiences'
    redirect(`/account/login?next=${encodeURIComponent(next)}`)
}
