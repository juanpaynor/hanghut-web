"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { ArrowRight, ArrowDown } from "lucide-react";
import { LiveMarquee } from "@/components/landing/live-marquee";

// Physics sim is client-only (matter-js touches window/canvas).
const PhysicsActivities = dynamic(() => import("@/components/landing/physics-activities"), { ssr: false });

const MARQUEE = [
    "MANILA", "CEBU CITY", "DAVAO", "ILOILO", "BAGUIO", "BORACAY",
    "PALAWAN", "SIARGAO", "TAGAYTAY", "CLARK", "SUBIC", "VIGAN",
];

// The kinetic centerpiece: the sentence stays, the verb changes.
const VERBS = ["goes out.", "shows up.", "links up.", "dances.", "gathers."];

export default function Hero() {
    const reduce = useReducedMotion();

    // Rotating verb
    const [vi, setVi] = useState(0);
    useEffect(() => {
        if (reduce) return;
        const id = setInterval(() => setVi((i) => (i + 1) % VERBS.length), 2400);
        return () => clearInterval(id);
    }, [reduce]);

    const line = {
        hidden: reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: "0.6em" },
        show: (i: number) => ({
            opacity: 1, y: 0,
            transition: { duration: 0.7, delay: reduce ? 0 : 0.15 + i * 0.12, ease: [0.22, 1, 0.36, 1] as const },
        }),
    };
    const fade = {
        hidden: reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 },
        show: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: reduce ? 0 : 0.55 + i * 0.1 } }),
    };

    return (
        <section className="relative flex min-h-[100dvh] flex-col justify-between overflow-hidden bg-kinetic-ink pt-20 text-kinetic-text">
            {/* Falling activity cards — the live social layer (draggable) */}
            <PhysicsActivities />

            {/* Soft brand glow, and a white vignette so the centered type stays legible over the cards */}
            <div className="pointer-events-none absolute -top-40 left-1/2 z-[1] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-kinetic-brand/10 blur-[150px]" />
            <div
                className="pointer-events-none absolute inset-0 z-[1]"
                style={{
                    background:
                        "radial-gradient(ellipse 46% 42% at 50% 42%, hsl(var(--background)) 30%, hsl(var(--background) / 0.65) 55%, transparent 78%)",
                }}
            />

            {/* Content — wrapper is click-through so cards behind stay draggable; only actual controls capture. */}
            <div className="pointer-events-none relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 py-16 text-center md:px-12">
                <h1 className="font-headline font-bold leading-[0.95] tracking-tight text-kinetic-text [text-shadow:0_1px_24px_hsl(var(--background))]">
                    <span className="block overflow-hidden">
                        <motion.span custom={0} variants={line} initial="hidden" animate="show" className="block text-[13vw] md:text-[8vw] lg:text-[6.5rem]">
                            Where everyone
                        </motion.span>
                    </span>
                    {/* Rotating verb line — width reserved by the longest word (ghost).
                        leading-[1.15] + bottom padding give descenders (g/y/p) room inside the overflow mask. */}
                    <span className="relative mt-1 flex items-center justify-center pb-[0.15em] text-[13vw] leading-[1.15] text-kinetic-brand md:text-[8vw] lg:text-[6.5rem]">
                        <span className="invisible" aria-hidden>shows up.</span>
                        <span className="absolute inset-0 flex items-center justify-center overflow-hidden">
                            <AnimatePresence mode="wait">
                                <motion.span
                                    key={vi}
                                    initial={reduce ? false : { y: "100%", opacity: 0, rotateX: -40 }}
                                    animate={{ y: 0, opacity: 1, rotateX: 0 }}
                                    exit={reduce ? undefined : { y: "-100%", opacity: 0, rotateX: 40 }}
                                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                                    className="block"
                                >
                                    {VERBS[vi]}
                                </motion.span>
                            </AnimatePresence>
                        </span>
                    </span>
                </h1>

                <motion.p
                    custom={1} variants={fade} initial="hidden" animate="show"
                    className="mt-8 max-w-xl text-lg text-kinetic-muted [text-shadow:0_1px_16px_hsl(var(--background))] md:text-xl"
                >
                    Discover events and experiences near you — or sell tickets and run the show. All in one place.
                </motion.p>

                <motion.div
                    custom={2} variants={fade} initial="hidden" animate="show"
                    className="pointer-events-auto mt-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center"
                >
                    <Link
                        href="/events"
                        className="group inline-flex items-center justify-center gap-2 rounded-full bg-kinetic-brand px-7 py-3.5 text-sm font-bold uppercase tracking-wide text-kinetic-brand-fg transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kinetic-brand/50"
                    >
                        Explore events
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </Link>
                    <Link
                        href="/organizer/login"
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-kinetic-line bg-kinetic-panel/70 px-7 py-3.5 text-sm font-bold uppercase tracking-wide text-kinetic-text backdrop-blur-sm transition-colors hover:border-kinetic-brand/40 hover:bg-kinetic-brand/5"
                    >
                        Start selling
                    </Link>
                </motion.div>
            </div>

            {/* Live marquee band */}
            <div className="relative z-10 border-y border-kinetic-line bg-kinetic-panel py-4">
                <LiveMarquee items={MARQUEE} duration={45} />
            </div>

            {/* Scroll cue */}
            <div className="pointer-events-none absolute bottom-24 left-1/2 z-10 hidden -translate-x-1/2 md:block">
                <ArrowDown className="h-5 w-5 animate-bounce text-kinetic-muted" />
            </div>
        </section>
    );
}
