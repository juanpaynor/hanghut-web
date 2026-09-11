"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Magnetic, MaskedLines } from "./primitives";

// Both layers touch window/canvas, so neither can render on the server.
const LightField = dynamic(() => import("./light-field"), { ssr: false });
const PhysicsCards = dynamic(() => import("./physics-cards"), { ssr: false });

// The sentence holds still; the verb is what changes. Same device as before —
// it is the single best line on the old page and there was no reason to lose it.
const VERBS = ["goes out.", "shows up.", "links up.", "dances.", "gathers."];

export default function Hero() {
    const reduce = useReducedMotion();
    const ref = useRef<HTMLElement>(null);
    const [vi, setVi] = useState(0);

    useEffect(() => {
        if (reduce) return;
        const id = setInterval(() => setVi((i) => (i + 1) % VERBS.length), 2600);
        return () => clearInterval(id);
    }, [reduce]);

    // The hero recedes as the page scrolls past it rather than simply leaving —
    // the next section arrives over the top of a dimming stage.
    const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
    const contentY = useTransform(scrollYProgress, [0, 1], [0, 140]);
    const contentOpacity = useTransform(scrollYProgress, [0, 0.65], [1, 0]);
    const contentScale = useTransform(scrollYProgress, [0, 1], [1, 0.94]);

    return (
        <section
            ref={ref}
            className="relative flex min-h-[100svh] flex-col justify-center overflow-hidden pt-20"
        >
            <LightField />

            {/* Legibility plate: the type sits in its own pool of dark so neither
                the aurora nor a settled card stack can eat a descender. */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-[2]"
                style={{
                    background:
                        "radial-gradient(ellipse 52% 46% at 50% 46%, rgba(255,255,255,0.92) 28%, rgba(255,255,255,0.66) 56%, transparent 80%)",
                }}
            />

            {/* Above the plate, not under it. The plate is there to keep the
                headline off the aurora, but a 92%-white veil over white cards
                erases them — on the old dark ground the same veil was invisible
                because the cards were dark too. The headline is heavy and nearly
                black, so it still reads where a card drifts behind it. */}
            <PhysicsCards />

            <motion.div
                style={reduce ? undefined : { y: contentY, opacity: contentOpacity, scale: contentScale }}
                className="pointer-events-none relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center px-6 py-20 text-center md:px-12"
            >
                <h1 className="lp-display leading-[0.88] text-[var(--lp-text)]">
                    <MaskedLines
                        delay={0.15}
                        lineClassName="text-[13.5vw] md:text-[9vw] lg:text-[7.5rem]"
                        lines={["Where everyone"]}
                    />

                    {/* The rotating line. Width is held open by an invisible copy of
                        the longest verb so the layout never jumps mid-swap, and the
                        mask gets bottom padding so descenders aren't clipped. */}
                    <span className="relative mt-1 flex items-center justify-center pb-[0.16em] text-[13.5vw] leading-[1.14] md:text-[9vw] lg:text-[7.5rem]">
                        <span className="invisible" aria-hidden>
                            shows up.
                        </span>
                        <span className="absolute inset-0 flex items-center justify-center overflow-hidden">
                            <AnimatePresence mode="wait">
                                <motion.span
                                    key={vi}
                                    initial={reduce ? false : { y: "105%", opacity: 0, rotateX: -55 }}
                                    animate={{ y: 0, opacity: 1, rotateX: 0 }}
                                    exit={reduce ? undefined : { y: "-105%", opacity: 0, rotateX: 55 }}
                                    transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                                    className="block bg-gradient-to-b from-[var(--lp-brand-soft)] to-[var(--lp-brand)] bg-clip-text text-transparent"
                                    style={{ transformPerspective: 900 }}
                                >
                                    {VERBS[vi]}
                                </motion.span>
                            </AnimatePresence>
                        </span>
                    </span>
                </h1>

                <motion.p
                    initial={reduce ? false : { opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.55 }}
                    className="mt-9 max-w-xl text-balance text-lg leading-relaxed text-[var(--lp-muted)] md:text-xl"
                >
                    Discover events and experiences near you — or sell tickets and run the show.
                    All in one place.
                </motion.p>

                <motion.div
                    initial={reduce ? false : { opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.68 }}
                    className="pointer-events-auto mt-11 flex flex-col items-center gap-3 sm:flex-row"
                >
                    <Magnetic>
                        <Link
                            href="/events"
                            className="group inline-flex items-center gap-2 rounded-full bg-[var(--lp-brand)] px-8 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--lp-brand-fg)] shadow-[0_14px_34px_-10px_rgba(79,70,229,0.55)] transition-shadow hover:shadow-[0_18px_46px_-8px_rgba(79,70,229,0.7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-brand-soft)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-void)]"
                        >
                            Explore events
                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </Link>
                    </Magnetic>
                    <Magnetic>
                        <Link
                            href="/organizer/login"
                            className="inline-flex items-center gap-2 rounded-full border border-[var(--lp-line-strong)] bg-[var(--lp-deep)] px-8 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--lp-text)] backdrop-blur-sm transition-colors hover:border-[var(--lp-brand-soft)] hover:bg-[var(--lp-brand)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-brand-soft)]"
                        >
                            Start selling
                        </Link>
                    </Magnetic>
                </motion.div>
            </motion.div>

            {/* Scroll cue — a line that falls, on a loop. */}
            <div className="pointer-events-none absolute bottom-8 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-3 md:flex">
                <span className="lp-mono text-[10px] uppercase tracking-[0.3em] text-[var(--lp-dim)]">
                    Scroll
                </span>
                <span className="relative block h-12 w-px overflow-hidden bg-[var(--lp-line-strong)]">
                    {!reduce && (
                        <motion.span
                            className="absolute inset-x-0 top-0 h-4 bg-[var(--lp-brand-soft)]"
                            animate={{ y: ["-100%", "300%"] }}
                            transition={{ duration: 1.9, repeat: Infinity, ease: "easeInOut" }}
                        />
                    )}
                </span>
            </div>
        </section>
    );
}
