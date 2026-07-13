"use client";

import Header from "@/components/landing/header";
import Footer from "@/components/landing/footer";
import Hero from "@/components/landing/hero";
import VideoBanner from "@/components/landing/video-banner";
import dynamic from "next/dynamic";
import { SectionErrorBoundary } from "@/components/landing/section-error-boundary";

// GSAP-powered sections — lazy loaded for performance
const FeaturesHorizontal = dynamic(() => import("@/components/landing/features-horizontal"), { ssr: false });
const PersonaCards = dynamic(() => import("@/components/landing/persona-cards"), { ssr: false });
const CTASection = dynamic(() => import("@/components/landing/cta-section"), { ssr: false });

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col font-sans antialiased" style={{ backgroundColor: "#FAFAF8" }}>
      <Header />
      <main className="flex-1">
        <SectionErrorBoundary>
          <Hero />
        </SectionErrorBoundary>
        <SectionErrorBoundary>
          <VideoBanner />
        </SectionErrorBoundary>
        <SectionErrorBoundary>
          <FeaturesHorizontal />
        </SectionErrorBoundary>
        <SectionErrorBoundary>
          <PersonaCards />
        </SectionErrorBoundary>
        <SectionErrorBoundary>
          <CTASection />
        </SectionErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}
