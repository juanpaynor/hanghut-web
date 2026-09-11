"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
    Armchair, ArrowRight, BarChart3, CalendarPlus, CreditCard, Mail, Store, Wallet,
} from "lucide-react";
import { MaskedLines, Reveal, SceneLabel } from "./primitives";

const CAPABILITIES = [
    { icon: CalendarPlus, n: "01", tag: "Create", title: "Events in minutes", body: "Guided builder, tiers, promo codes, registration questions, approvals." },
    { icon: Armchair, n: "02", tag: "Seats", title: "Map every seat", body: "Draw sections, price by tier or seat, reserved seating with live holds." },
    { icon: Store, n: "03", tag: "Brand", title: "Your own storefront", body: "A branded page at hanghut.com/you — themes, fonts, custom CSS." },
    { icon: CreditCard, n: "04", tag: "Payments", title: "Get paid, locally", body: "Cards, GCash, Maya, QRPh — powered by Xendit, built for the Philippines." },
    { icon: Wallet, n: "05", tag: "Payouts", title: "Real settlement", body: "Track balances and payouts with honest, synced settlement status." },
    { icon: BarChart3, n: "06", tag: "Insights", title: "Know your crowd", body: "Revenue, LTV, RFM segments, attendee lists — export in a click." },
    { icon: Mail, n: "07", tag: "Marketing", title: "Fill the room", body: "Lifecycle emails, campaigns and drafts to bring buyers back." },
];

/**
 * Scene 03 — the web product. Seven capabilities and the sign-up, laid on a
 * single hairline grid so it reads as one system rather than seven cards.
 *
 * The numbering is the order an organiser actually meets these things, from
 * building the event to getting paid, which is why it runs 01→08 and ends on
 * the CTA rather than being decorative.
 */
export default function Platform() {
    const gridRef = useRef<HTMLDivElement>(null);
    const [lit, setLit] = useState(false);
    const reduce = useReducedMotion();

    // One spotlight for the whole grid, positioned by CSS custom properties, so
    // pointer movement costs two style writes rather than a React render per tile.
    const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const el = gridRef.current;
        if (!el || reduce) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };

    return (
        <section className="relative overflow-hidden py-24 md:py-36">
            <div className="mx-auto max-w-7xl px-6 md:px-12">
                <Reveal className="flex flex-col gap-6">
                    <SceneLabel index="03" label="For everyone running one" />
                    <h2 className="lp-display max-w-4xl text-4xl leading-[0.9] text-[var(--lp-text)] md:text-7xl">
                        <MaskedLines
                            lines={[
                                "Everything you need",
                                <span key="b" className="bg-gradient-to-r from-[var(--lp-brand-soft)] to-[var(--lp-brand)] bg-clip-text text-transparent">
                                    to run the show.
                                </span>,
                            ]}
                        />
                    </h2>
                    <p className="max-w-xl text-lg leading-relaxed text-[var(--lp-muted)]">
                        One dashboard from first ticket to final payout — no spreadsheets, no
                        third-party stack.
                    </p>
                </Reveal>

                <div
                    ref={gridRef}
                    onPointerMove={onMove}
                    onPointerEnter={() => setLit(true)}
                    onPointerLeave={() => setLit(false)}
                    className="relative mt-16 grid grid-cols-1 gap-px overflow-hidden rounded-[28px] border border-[var(--lp-line-strong)] bg-[var(--lp-line)] sm:grid-cols-2 lg:grid-cols-4"
                >
                    {CAPABILITIES.map((cap, i) => {
                        const Icon = cap.icon;
                        return (
                            <Reveal key={cap.n} delay={(i % 4) * 0.05} amount={0.15} className="h-full">
                                <div className="group relative flex h-full flex-col bg-[var(--lp-void)] p-8 transition-colors duration-500 hover:bg-[var(--lp-deep)]">
                                    <div className="flex items-start justify-between">
                                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--lp-line-strong)] bg-[var(--lp-brand)]/10 text-[var(--lp-brand-soft)] transition-all duration-500 group-hover:border-[var(--lp-brand-soft)] group-hover:bg-[var(--lp-brand)]/25">
                                            <Icon className="h-5 w-5" />
                                        </span>
                                        <span className="lp-mono text-[11px] uppercase tracking-[0.2em] text-[var(--lp-dim)]">
                                            {cap.n} <span className="text-[var(--lp-line-strong)]">/</span> {cap.tag}
                                        </span>
                                    </div>
                                    <h3 className="mt-8 text-xl font-semibold text-[var(--lp-text)]">{cap.title}</h3>
                                    <p className="mt-3 text-sm leading-relaxed text-[var(--lp-muted)]">{cap.body}</p>
                                </div>
                            </Reveal>
                        );
                    })}

                    <Reveal delay={0.1} amount={0.15} className="h-full">
                        <Link
                            href="/organizer/login"
                            className="group relative flex h-full flex-col justify-between overflow-hidden bg-[var(--lp-brand)] p-8 text-[var(--lp-brand-fg)]"
                        >
                            <span
                                aria-hidden
                                className="absolute inset-0 translate-y-full bg-gradient-to-t from-[var(--lp-brand-soft)] to-[var(--lp-brand)] transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-y-0"
                            />
                            <span className="relative lp-mono text-[11px] uppercase tracking-[0.2em] text-white/70">
                                08 <span className="text-white/40">/</span> Go live
                            </span>
                            <span className="relative">
                                <span className="lp-display block text-2xl leading-tight">
                                    Create your first event
                                </span>
                                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.12em]">
                                    Start free
                                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1.5" />
                                </span>
                            </span>
                        </Link>
                    </Reveal>

                    {/* Spotlight plate. `screen` blend keeps it purely additive, so it
                        lightens the grid without washing out the text underneath. */}
                    {!reduce && (
                        <div
                            aria-hidden
                            className="pointer-events-none absolute inset-0 transition-opacity duration-500"
                            style={{
                                opacity: lit ? 1 : 0,
                                // `screen` over white is a no-op — there is nothing
                                // left to lighten. On a light ground the spotlight
                                // has to darken, so it multiplies a faint indigo.
                                mixBlendMode: "multiply",
                                background:
                                    "radial-gradient(340px circle at var(--mx, 50%) var(--my, 50%), rgba(79,70,229,0.11), transparent 70%)",
                            }}
                        />
                    )}
                </div>

                {/* The one live number the platform can honestly stand on. */}
                <motion.p
                    initial={reduce ? false : { opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    className="mt-8 text-center text-sm text-[var(--lp-dim)]"
                >
                    Free to start. No monthly fee, no setup cost.
                </motion.p>
            </div>
        </section>
    );
}
