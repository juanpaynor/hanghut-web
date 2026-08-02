"use client";

import Link from "next/link";
import { Reveal } from "@/components/landing/reveal";
import {
    CalendarPlus, Armchair, Store, CreditCard, Wallet, BarChart3, Mail, ArrowRight,
} from "lucide-react";

/**
 * "SELL OUT" — the organizer/ticketing platform track. This is the half the old
 * landing never showed: the web product (events, seat maps, storefronts,
 * payments, payouts, analytics, email). Blue-tagged, data-forward tiles.
 */
const CAPABILITIES = [
    { icon: CalendarPlus, tag: "01 / CREATE", title: "Events in minutes", body: "Guided builder, tiers, promo codes, registration questions, approvals." },
    { icon: Armchair, tag: "02 / SEATS", title: "Map every seat", body: "Draw sections, price by tier or seat, reserved seating with live holds." },
    { icon: Store, tag: "03 / BRAND", title: "Your own storefront", body: "A branded page at hanghut.com/you — themes, fonts, custom CSS." },
    { icon: CreditCard, tag: "04 / PAYMENTS", title: "Get paid, locally", body: "Cards, GCash, Maya, QRPh — powered by Xendit, built for the Philippines." },
    { icon: Wallet, tag: "05 / PAYOUTS", title: "Real settlement", body: "Track balances and payouts with honest, synced settlement status." },
    { icon: BarChart3, tag: "06 / INSIGHTS", title: "Know your crowd", body: "Revenue, LTV, RFM segments, attendee lists — export in a click." },
    { icon: Mail, tag: "07 / MARKETING", title: "Fill the room", body: "Lifecycle emails, campaigns and drafts to bring buyers back." },
];

export default function OrganizerTrack() {
    return (
        <section className="relative bg-kinetic-ink py-24 md:py-32">
            <div className="mx-auto max-w-7xl px-6 md:px-12">
                <Reveal>
                    <div className="flex items-center gap-3">
                        <span className="h-2 w-2 rounded-full bg-kinetic-brand" />
                        <span className="font-body text-xs uppercase tracking-[0.3em] text-kinetic-brand">Sell out</span>
                    </div>
                    <h2 className="mt-4 max-w-3xl font-headline text-4xl font-extrabold leading-[0.95] tracking-tight text-kinetic-text md:text-6xl">
                        Everything you need to <span className="text-kinetic-brand">run the show.</span>
                    </h2>
                    <p className="mt-5 max-w-xl text-lg text-kinetic-muted">
                        One dashboard from first ticket to final payout — no spreadsheets, no third-party stack.
                    </p>
                </Reveal>

                <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-kinetic-line bg-kinetic-line sm:grid-cols-2 lg:grid-cols-3">
                    {CAPABILITIES.map((cap, i) => {
                        const Icon = cap.icon;
                        return (
                            <Reveal key={cap.tag} delay={(i % 3) * 0.06} className="h-full">
                                <div className="group flex h-full flex-col bg-kinetic-ink p-7 transition-colors duration-300 hover:bg-kinetic-panel">
                                    <div className="flex items-center justify-between">
                                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-kinetic-brand/10 text-kinetic-brand transition-colors group-hover:bg-kinetic-brand/20">
                                            <Icon className="h-5 w-5" />
                                        </span>
                                        <span className="font-body text-[10px] uppercase tracking-[0.2em] text-kinetic-muted">{cap.tag}</span>
                                    </div>
                                    <h3 className="mt-5 text-xl font-bold text-kinetic-text">{cap.title}</h3>
                                    <p className="mt-2 text-sm leading-relaxed text-kinetic-muted">{cap.body}</p>
                                </div>
                            </Reveal>
                        );
                    })}
                    {/* CTA tile fills the 8th grid cell */}
                    <Reveal delay={0.12} className="h-full">
                        <Link
                            href="/organizer/login"
                            className="group flex h-full flex-col justify-between bg-kinetic-brand p-7 text-kinetic-brand-fg transition-transform hover:scale-[1.01]"
                        >
                            <span className="font-body text-[10px] uppercase tracking-[0.2em] text-kinetic-brand-fg/70">08 / GO LIVE</span>
                            <div>
                                <h3 className="text-2xl font-extrabold leading-tight">Create your first event</h3>
                                <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
                                    Start free <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                                </span>
                            </div>
                        </Link>
                    </Reveal>
                </div>
            </div>
        </section>
    );
}
