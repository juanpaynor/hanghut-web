import Features from "@/components/landing/features";
import Footer from "@/components/landing/footer";

import Hero from "@/components/landing/hero";

import StatsStrip from "@/components/landing/stats-strip";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <main className="flex-1">
        <Hero />
        <StatsStrip />
        <Features />
      </main>
      <Footer />
    </div>
  );
}
