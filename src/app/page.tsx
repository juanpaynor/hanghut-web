import { headers } from 'next/headers'
import LandingPage from '@/components/landing/landing-page'

// Force dynamic rendering so middleware subdomain rewrites work
export const dynamic = 'force-dynamic'

export default async function Home() {
  // Reading headers opts this page out of static generation
  await headers()
  return <LandingPage />
}
