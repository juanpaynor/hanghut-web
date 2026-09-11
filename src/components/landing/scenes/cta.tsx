"use client";

import Link from "next/link";
import { useRef } from "react";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { StoreButtons } from "@/components/landing/store-buttons";
import { Magnetic, MaskedLines } from "./primitives";

/**
 * Scene 06 — the close. The two audiences the whole page has been alternating
 * between finally sit side by side, each with the one action that belongs to it.
 */
export default function CTA() {
    const ref = useRef<HTMLElement>(null);
    const reduce = useReducedMotion();

    const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end end"] });
    // The grid drifts as the panel arrives, which gives the flat brand block a
    // sense of depth without another gradient.
    const gridY = useTransform(scrollYProgress, [0, 1], [-40, 40]);

    return (
        <section ref={ref} className="relative px-6 py-24 md:px-12 md:py-36">
            <motion.div
                initial={reduce ? false : { opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="relative mx-auto max-w-6xl overflow-hidden rounded-[40px] bg-[var(--lp-brand)] px-8 py-20 text-[var(--lp-brand-fg)] shadow-[0_80px_160px_-60px_rgba(91,76,245,0.9)] md:px-16"
            >
                <motion.div
                    aria-hidden
                    style={reduce ? undefined : { y: gridY }}
                    className="pointer-events-none absolute inset-x-0 -inset-y-24 opacity-[0.14]"
                >
                    <div
                        className="h-full w-full"
                        style={{
                            backgroundImage:
                                "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
                            backgroundSize: "56px 56px",
                        }}
                    />
                </motion.div>

                <div
                    aria-hidden
                    className="pointer-events-none absolute -right-20 -top-32 h-96 w-96 rounded-full bg-white/25 blur-[110px]"
                />

                <div className="relative">
                    <h2 className="lp-display max-w-3xl text-5xl leading-[0.9] md:text-7xl">
                        <MaskedLines lines={["Your next sold-out", "night starts here."]} />
                    </h2>

                    <div className="mt-14 grid gap-10 md:grid-cols-2">
                        <div className="border-t border-white/25 pt-7">
                            <p className="lp-mono text-[11px] uppercase tracking-[0.28em] text-white/70">
                                For organizers
                            </p>
                            <p className="mt-4 max-w-sm text-lg font-medium">
                                Sell tickets, map seats, get paid.
                            </p>
                            <Magnetic>
                                <Link
                                    href="/organizer/login"
                                    className="group mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--lp-void)] px-7 py-3.5 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--lp-text)] transition-colors hover:bg-[var(--lp-deep)]"
                                >
                                    Start selling
                                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                                </Link>
                            </Magnetic>
                        </div>

                        <div className="border-t border-white/25 pt-7">
                            <p className="lp-mono text-[11px] uppercase tracking-[0.28em] text-white/70">
                                For everyone else
                            </p>
                            <p className="mt-4 max-w-sm text-lg font-medium">
                                Discover events and real hangouts near you.
                            </p>
                            <div className="mt-6">
                                <StoreButtons variant="dark" />
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </section>
    );
}
