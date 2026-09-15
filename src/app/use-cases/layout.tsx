import type { ReactNode } from 'react'
import LandingHeader from '@/components/landing/scenes/header'
import LandingFooter from '@/components/landing/scenes/footer'

/**
 * The use-case pages are the landing's sales pages, so they wear the landing:
 * same tokens (`.landing-theme`), same header/footer, same display + mono
 * faces. Fonts are loaded here, like on `/`, rather than in the root layout so
 * the dashboard never pays for them.
 */
export default function UseCasesLayout({ children }: { children: ReactNode }) {
    return (
        <>
            <link
                rel="stylesheet"
                href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=JetBrains+Mono:wght@400;500&display=swap"
            />
            <div className="landing-theme flex min-h-dvh flex-col font-body antialiased">
                <LandingHeader />
                <main className="flex-1">{children}</main>
                <LandingFooter />
            </div>
        </>
    )
}
