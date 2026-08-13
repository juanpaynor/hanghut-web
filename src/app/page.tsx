import { headers } from 'next/headers'
import LandingPage from '@/components/landing/landing-page'
import { CaptureAttribution } from '@/components/tracking/track-view'

// Force dynamic rendering so middleware subdomain rewrites work
export const dynamic = 'force-dynamic'

export default async function Home() {
  // Reading headers opts this page out of static generation
  await headers()
  return (
    <>
      {/* Capture ?ref from platform /r/<code> links so a later partner signup is attributed. */}
      <CaptureAttribution surface="landing" />
      <LandingPage />
    </>
  )
}
