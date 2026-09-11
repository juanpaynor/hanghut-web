"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring } from "motion/react";
import { LogIn, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Magnetic } from "./primitives";

const NAV = [
    { label: "Events", href: "/events" },
    { label: "Become a partner", href: "/ticketing" },
    { label: "Pricing", href: "/pricing" },
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
    const reduce = useReducedMotion();

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
                        className="fixed inset-0 z-[60] bg-[var(--lp-void)] px-6 py-6 md:hidden"
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

                        <nav className="mt-14 flex flex-col gap-2">
                            {[...NAV, { label: "Log in", href: "/organizer/login" }].map((item, i) => (
                                <motion.div
                                    key={item.href}
                                    initial={reduce ? false : { opacity: 0, y: 24 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.06 + i * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                                >
                                    <Link
                                        href={item.href}
                                        onClick={() => setOpen(false)}
                                        className="lp-display block border-b border-[var(--lp-line)] py-5 text-4xl text-[var(--lp-text)]"
                                    >
                                        {item.label}
                                    </Link>
                                </motion.div>
                            ))}
                        </nav>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
