"use client";

import Link from "next/link";
import Header from "@/components/landing/header";
import Footer from "@/components/landing/footer";
import Hero from "@/components/landing/hero";
import VideoBanner from "@/components/landing/video-banner";
import AttendeeTrack from "@/components/landing/attendee-track";
import OrganizerTrack from "@/components/landing/organizer-track";
import TrustBand from "@/components/landing/trust-band";
import CTASection from "@/components/landing/cta-section";
import { Reveal } from "@/components/landing/reveal";
import { SectionErrorBoundary } from "@/components/landing/section-error-boundary";
import { ArrowRight } from "lucide-react";

function PricingTeaser() {
    return (
        <section className="border-y border-kinetic-line bg-kinetic-panel px-6 py-20 md:px-12">
            <Reveal className="mx-auto flex max-w-5xl flex-col items-center gap-6 text-center">
                <span className="text-xs font-semibold uppercase tracking-[0.3em] text-kinetic-muted">Pricing</span>
                <h2 className="font-headline text-4xl font-bold tracking-tight text-kinetic-text md:text-6xl">
                    Just <span className="text-kinetic-brand">2% + ₱15</span> per ticket.
                </h2>
                <p className="max-w-xl text-lg text-kinetic-muted">
                    No monthly fees, no setup cost. You keep the rest — free events stay free to run.
                </p>
                <Link
                    href="/pricing"
                    className="group inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-kinetic-brand hover:underline"
                >
                    See full pricing
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
            </Reveal>
        </section>
    );
}

export default function LandingPage() {
    return (
        <div className="flex min-h-dvh flex-col bg-kinetic-ink font-body text-kinetic-text antialiased">
            <Header />
            <main className="flex-1">
                <SectionErrorBoundary><Hero /></SectionErrorBoundary>
                <SectionErrorBoundary><VideoBanner /></SectionErrorBoundary>
                <SectionErrorBoundary><AttendeeTrack /></SectionErrorBoundary>
                <SectionErrorBoundary><OrganizerTrack /></SectionErrorBoundary>
                <SectionErrorBoundary><PricingTeaser /></SectionErrorBoundary>
                <SectionErrorBoundary><TrustBand /></SectionErrorBoundary>
                <SectionErrorBoundary><CTASection /></SectionErrorBoundary>
            </main>
            <Footer />
        </div>
    );
}
