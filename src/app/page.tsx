"use client";

import Header from "@/components/landing/header";
import Footer from "@/components/landing/footer";
import Hero from "@/components/landing/hero";
import dynamic from "next/dynamic";

// GSAP-powered sections — lazy loaded for performance
const HowItWorks = dynamic(() => import("@/components/landing/how-it-works"), { ssr: false });
const FeaturesHorizontal = dynamic(() => import("@/components/landing/features-horizontal"), { ssr: false });
const PersonaCards = dynamic(() => import("@/components/landing/persona-cards"), { ssr: false });
const CTASection = dynamic(() => import("@/components/landing/cta-section"), { ssr: false });

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col font-sans antialiased" style={{ backgroundColor: "#FAFAF8" }}>
      <Header />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <FeaturesHorizontal />
        <PersonaCards />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
