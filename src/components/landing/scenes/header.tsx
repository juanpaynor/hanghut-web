"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring } from "motion/react";
import { ArrowRight, ChevronDown, LogIn, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Magnetic } from "./primitives";
import { USE_CASES } from "@/lib/marketing/use-cases";

/**
 * Two audiences, two next steps. Attendees get Events / Experiences straight
 * in the bar; organizers get one entry ("For organizers") that opens into the
 * sell-tickets funnel and the six use-case pages — which existed and were
 * linked from nowhere above the footer.
 */
const NAV = [
    { label: "Events", href: "/events" },
    { label: "Experiences", href: "/experiences" },
];

const ORGANIZER_START = [
    { label: "Sell tickets", href: "/ticketing", hint: "Set up in minutes. Paid out to your GCash or bank." },
    { label: "Pricing", href: "/pricing", hint: "2% + ₱15 per ticket. Free events are free." },
    { label: "Embed & API", href: "/docs", hint: "Sell on your own site with a widget or the API." },
];

const APP_STORE = "https://apps.apple.com/ph/app/hanghut-social-hangouts/id6764278827";

/**
 * The landing's own header. The shared one in `components/landing/header.tsx`
 * is still used by /events, /pricing, /ticketing and the use-case pages, all of
 * which are light — so this is a sibling rather than a restyle of that file.
 */
export default function LandingHeader() {
    const [scrolled, setScrolled] = useState(false);
    const [open, setOpen] = useState(false);
    const [orgOpen, setOrgOpen] = useState(false);
    const closeTimer = useRef<number | null>(null);
    const reduce = useReducedMotion();

    // Hover-open with a short grace on leave so the diagonal move from the
    // trigger into the panel doesn't slam it shut; click toggles for touch
    // and keyboard; Escape closes.
    const openOrg = () => {
        if (closeTimer.current) window.clearTimeout(closeTimer.current);
        setOrgOpen(true);
    };
    const closeOrg = (delay = 120) => {
        if (closeTimer.current) window.clearTimeout(closeTimer.current);
        closeTimer.current = window.setTimeout(() => setOrgOpen(false), delay);
    };
    useEffect(() => {
        if (!orgOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOrgOpen(false); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [orgOpen]);

    const { scrollYProgress } = useScroll();
    const progress = useSpring(scrollYProgress, { stiffness: 90, damping: 26, restDelta: 0.001 });

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 24);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    // A locked body behind an open sheet — otherwise the page scrolls underneath.
    useEffect(() => {
        document.body.style.overflow = open ? "hidden" : "";
        return () => {
            document.body.style.overflow = "";
        };
    }, [open]);

    return (
        <>
            <header
                className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${
                    scrolled
                        ? "border-b border-[var(--lp-line)] bg-[rgba(255,255,255,0.80)] backdrop-blur-xl"
                        : "border-b border-transparent bg-transparent"
                }`}
            >
                <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 md:px-12">
                    <Link href="/" className="group relative flex items-center" aria-label="HangHut home">
                        <span className="relative block h-11 w-11 transition-transform duration-500 group-hover:rotate-[8deg] group-hover:scale-110">
                            <Image src="/logo_transparent.png" alt="HangHut" fill className="object-contain" />
                        </span>
                    </Link>

                    <nav className="hidden items-center gap-1 md:flex">
                        {NAV.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className="group relative px-4 py-2 text-[13px] font-medium uppercase tracking-[0.14em] text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-text)]"
                            >
                                {item.label}
                                <span className="absolute bottom-1 left-4 right-4 h-px origin-left scale-x-0 bg-[var(--lp-brand-soft)] transition-transform duration-300 group-hover:scale-x-100" />
                            </Link>
                        ))}

                        {/* For organizers — dropdown */}
                        <div
                            className="relative"
                            onMouseEnter={openOrg}
                            onMouseLeave={() => closeOrg()}
                            onFocus={openOrg}
                            onBlur={(e) => {
                                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) closeOrg(0);
                            }}
                        >
                            <button
                                type="button"
                                aria-haspopup="true"
                                aria-expanded={orgOpen}
                                onClick={() => (orgOpen ? setOrgOpen(false) : openOrg())}
                                className={`group relative inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium uppercase tracking-[0.14em] transition-colors ${
                                    orgOpen ? "text-[var(--lp-text)]" : "text-[var(--lp-muted)] hover:text-[var(--lp-text)]"
                                }`}
                            >
                                For organizers
                                <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-300 ${orgOpen ? "rotate-180" : ""}`} />
                                <span className={`absolute bottom-1 left-4 right-4 h-px origin-left bg-[var(--lp-brand-soft)] transition-transform duration-300 ${orgOpen ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"}`} />
                            </button>

                            <AnimatePresence>
                                {orgOpen && (
                                    <motion.div
                                        initial={reduce ? false : { opacity: 0, y: 8, scale: 0.98 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 6, scale: 0.98, transition: { duration: 0.15 } }}
                                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                                        className="absolute left-1/2 top-full z-50 w-[40rem] -translate-x-1/2 pt-3"
                                    >
                                        {/* pt-3 keeps a hover bridge between trigger and panel */}
                                        <div className="grid grid-cols-[1.05fr_1fr] overflow-hidden rounded-2xl border border-[var(--lp-line)] bg-[var(--lp-void)] shadow-[0_24px_60px_-24px_rgba(23,21,48,0.35)]">
                                            <div className="p-3">
                                                <p className="lp-mono px-3 pb-2 pt-1 text-[10px] uppercase tracking-[0.3em] text-[var(--lp-dim)]">Start</p>
                                                {ORGANIZER_START.map((item) => (
                                                    <Link
                                                        key={item.href}
                                                        href={item.href}
                                                        onClick={() => setOrgOpen(false)}
                                                        className="group/i block rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--lp-deep)]"
                                                    >
                                                        <span className="flex items-center gap-1.5 text-[14px] font-semibold text-[var(--lp-text)]">
                                                            {item.label}
                                                            <ArrowRight className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all group-hover/i:translate-x-0 group-hover/i:opacity-100" />
                                                        </span>
                                                        <span className="mt-0.5 block text-[12.5px] leading-snug text-[var(--lp-muted)]">{item.hint}</span>
                                                    </Link>
                                                ))}
                                            </div>
                                            <div className="border-l border-[var(--lp-line)] bg-[var(--lp-deep)] p-3">
                                                <p className="lp-mono px-3 pb-2 pt-1 text-[10px] uppercase tracking-[0.3em] text-[var(--lp-dim)]">Built for</p>
                                                <ul className="grid grid-cols-1">
                                                    {USE_CASES.map((uc) => (
                                                        <li key={uc.slug}>
                                                            <Link
                                                                href={`/use-cases/${uc.slug}`}
                                                                onClick={() => setOrgOpen(false)}
                                                                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] text-[var(--lp-text)] transition-colors hover:bg-[var(--lp-void)]"
                                                            >
                                                                <span aria-hidden className="text-base leading-none">{uc.emoji}</span>
                                                                {uc.name}
                                                            </Link>
                                                        </li>
                                                    ))}
                                                </ul>
                                                <Link
                                                    href="/use-cases"
                                                    onClick={() => setOrgOpen(false)}
                                                    className="mt-1 flex items-center gap-1 px-3 py-2 text-[12.5px] font-medium text-[var(--lp-brand)] hover:underline"
                                                >
                                                    All use cases <ArrowRight className="h-3.5 w-3.5" />
                                                </Link>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        <Link
                            href="/pricing"
                            className="group relative px-4 py-2 text-[13px] font-medium uppercase tracking-[0.14em] text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-text)]"
                        >
                            Pricing
                            <span className="absolute bottom-1 left-4 right-4 h-px origin-left scale-x-0 bg-[var(--lp-brand-soft)] transition-transform duration-300 group-hover:scale-x-100" />
                        </Link>
                    </nav>

                    <div className="flex items-center gap-2">
                        <Link
                            href="/organizer/login"
                            className="hidden items-center gap-2 rounded-full border border-[var(--lp-line-strong)] px-4 py-2 text-[13px] font-medium text-[var(--lp-text)] transition-colors hover:border-[var(--lp-brand-soft)] hover:bg-[var(--lp-deep)] sm:inline-flex"
                        >
                            <LogIn className="h-4 w-4" />
                            Log in
                        </Link>

                        <Magnetic strength={0.25}>
                            <a
                                href={APP_STORE}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="relative inline-flex items-center overflow-hidden rounded-full bg-[var(--lp-brand)] px-5 py-2.5 text-[13px] font-semibold text-[var(--lp-brand-fg)] shadow-[0_8px_22px_-8px_rgba(79,70,229,0.6)] transition-shadow hover:shadow-[0_12px_30px_-8px_rgba(79,70,229,0.75)]"
                            >
                                Download app
                            </a>
                        </Magnetic>

                        <button
                            type="button"
                            onClick={() => setOpen(true)}
                            aria-label="Open menu"
                            className="ml-1 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--lp-line-strong)] text-[var(--lp-text)] md:hidden"
                        >
                            <Menu className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* Read-progress hairline. Doubles as the only always-on indication
                    of how long the page is. */}
                <motion.div
                    style={{ scaleX: reduce ? 1 : progress }}
                    className="h-px origin-left bg-gradient-to-r from-[var(--lp-brand)] to-[var(--lp-brand-soft)]"
                />
            </header>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="fixed inset-0 z-[60] flex flex-col bg-[var(--lp-void)] px-6 py-6 md:hidden"
                    >
                        <div className="flex items-center justify-between">
                            <span className="lp-mono text-[11px] uppercase tracking-[0.3em] text-[var(--lp-dim)]">
                                Menu
                            </span>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                aria-label="Close menu"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--lp-line-strong)] text-[var(--lp-text)]"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <nav className="mt-10 flex flex-col overflow-y-auto pb-10">
                            {[...NAV, { label: "Pricing", href: "/pricing" }, { label: "Log in", href: "/organizer/login" }].map((item, i) => (
                                <motion.div
                                    key={item.href}
                                    initial={reduce ? false : { opacity: 0, y: 24 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.06 + i * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                                >
                                    <Link
                                        href={item.href}
                                        onClick={() => setOpen(false)}
                                        className="lp-display block border-b border-[var(--lp-line)] py-4 text-4xl text-[var(--lp-text)]"
                                    >
                                        {item.label}
                                    </Link>
                                </motion.div>
                            ))}

                            <motion.div
                                initial={reduce ? false : { opacity: 0, y: 24 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.34, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                                className="mt-8"
                            >
                                <p className="lp-mono text-[10px] uppercase tracking-[0.3em] text-[var(--lp-dim)]">For organizers</p>
                                <div className="mt-3 flex flex-col">
                                    {ORGANIZER_START.map((item) => (
                                        <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="border-b border-[var(--lp-line)] py-3 text-lg font-semibold text-[var(--lp-text)]">
                                            {item.label}
                                        </Link>
                                    ))}
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {USE_CASES.map((uc) => (
                                        <Link
                                            key={uc.slug}
                                            href={`/use-cases/${uc.slug}`}
                                            onClick={() => setOpen(false)}
                                            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--lp-line-strong)] px-3 py-1.5 text-[13px] text-[var(--lp-text)]"
                                        >
                                            <span aria-hidden>{uc.emoji}</span>{uc.name}
                                        </Link>
                                    ))}
                                </div>
                            </motion.div>
                        </nav>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
