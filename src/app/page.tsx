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
      {/*
        The landing's display and mono faces, loaded here rather than in the root
        layout so the organizer dashboard and every other page don't pay for two
        extra families they never render. React hoists this into <head>.
      */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=JetBrains+Mono:wght@400;500&display=swap"
      />
      {/* Capture ?ref from platform /r/<code> links so a later partner signup is attributed. */}
      <CaptureAttribution surface="landing" />
      <LandingPage />
    </>
  )
}
