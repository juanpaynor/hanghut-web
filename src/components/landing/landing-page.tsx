import LandingHeader from "@/components/landing/scenes/header";
import LandingFooter from "@/components/landing/scenes/footer";
import Hero from "@/components/landing/scenes/hero";
import Film from "@/components/landing/scenes/film";
import Discover from "@/components/landing/scenes/discover";
import Platform from "@/components/landing/scenes/platform";
import Pricing from "@/components/landing/scenes/pricing";
import Trust from "@/components/landing/scenes/trust";
import CTA from "@/components/landing/scenes/cta";
import Rail from "@/components/landing/scenes/rail";
import { SectionErrorBoundary } from "@/components/landing/section-error-boundary";

/**
 * The landing page: six numbered scenes.
 *
 * The `.landing-theme` class on the root scopes the palette defined in
 * globals.css to this subtree. It is white, like the rest of the app — a dark
 * landing in front of a white product read as two different products — but it
 * keeps its own tokens so the landing can stay more art-directed than a
 * dashboard without leaking those choices into one.
 *
 * The header and footer here are the landing's own. The shared ones in
 * components/landing/ are still used by /events, /pricing, /ticketing and the
 * use-case pages, so they are deliberately left alone.
 *
 * Each scene stays wrapped in SectionErrorBoundary. Several of them run WebGL,
 * a physics solver, or a video, and a landing page that blanks because one
 * canvas failed on one device is worse than a landing page missing a scene.
 */
export default function LandingPage() {
    return (
        <div className="landing-theme flex min-h-dvh flex-col font-body antialiased">
            <LandingHeader />
            <Rail />

            <main className="flex-1">
                <SectionErrorBoundary>
                    <Hero />
                </SectionErrorBoundary>

                <div id="scene-film" className="scroll-mt-24">
                    <SectionErrorBoundary>
                        <Film />
                    </SectionErrorBoundary>
                </div>

                <div id="scene-discover" className="scroll-mt-24">
                    <SectionErrorBoundary>
                        <Discover />
                    </SectionErrorBoundary>
                </div>

                <div id="scene-platform" className="scroll-mt-24">
                    <SectionErrorBoundary>
                        <Platform />
                    </SectionErrorBoundary>
                </div>

                <div id="scene-pricing" className="scroll-mt-24">
                    <SectionErrorBoundary>
                        <Pricing />
                    </SectionErrorBoundary>
                </div>

                <div id="scene-trust" className="scroll-mt-24">
                    <SectionErrorBoundary>
                        <Trust />
                    </SectionErrorBoundary>
                </div>

                <div id="scene-start" className="scroll-mt-24">
                    <SectionErrorBoundary>
                        <CTA />
                    </SectionErrorBoundary>
                </div>
            </main>

            <LandingFooter />
        </div>
    );
}
