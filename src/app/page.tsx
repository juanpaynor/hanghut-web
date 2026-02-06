import Header from "@/components/landing/header";
import Features from "@/components/landing/features";
import Footer from "@/components/landing/footer";
import Hero from "@/components/landing/hero";
import StatsStrip from "@/components/landing/stats-strip";
import PartnerCTA from "@/components/landing/partner-cta";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-background font-sans antialiased">
      <Header />
      <main className="flex-1">
        <Hero />
        <StatsStrip />
        <Features />
        <PartnerCTA />
      </main>
      <Footer />
    </div>
  );
}
