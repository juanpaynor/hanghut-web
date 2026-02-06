import dynamic from "next/dynamic";
import Header from "@/components/landing/header";
import Footer from "@/components/landing/footer";
import Hero from "@/components/landing/hero";
import Marquee from "@/components/landing/marquee";

// Lazy load below-the-fold components for better performance
const Features = dynamic(() => import("@/components/landing/features"), { ssr: true });
const SocialCircleSection = dynamic(() => import("@/components/landing/social-circle-section"), { ssr: true });
const PartnerCTA = dynamic(() => import("@/components/landing/partner-cta"), { ssr: true });

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-background font-sans antialiased">
      <Header />
      <main className="flex-1">
        <Hero />
        <Marquee />
        <Features />
        <SocialCircleSection />
        <PartnerCTA />
      </main>
      <Footer />
    </div>
  );
}
