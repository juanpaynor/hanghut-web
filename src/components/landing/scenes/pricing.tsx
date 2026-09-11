"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CountUp, Magnetic, Reveal, SceneLabel } from "./primitives";

/**
 * Scene 04 — the fee, stated once and large. Everything else on this page is an
 * argument; this is the number the argument is about, so it gets a whole band
 * and nothing competes with it.
 */
export default function Pricing() {
    return (
        <section className="relative overflow-hidden border-y border-[var(--lp-line)] bg-[var(--lp-deep)] py-24 md:py-36">
            <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 h-[360px] w-[860px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--lp-brand)]/10 blur-[150px]"
            />

            <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-10 px-6 text-center md:px-12">
                <Reveal>
                    <SceneLabel index="04" label="Pricing" />
                </Reveal>

                <Reveal delay={0.06}>
                    <p className="text-lg text-[var(--lp-muted)]">Just</p>
                    <div className="lp-display mt-3 flex items-end justify-center gap-4 leading-[0.85] text-[var(--lp-text)]">
                        <span className="text-[22vw] tabular-nums md:text-[11rem]">
                            <CountUp to={2} />
                            <span className="text-[var(--lp-brand-soft)]">%</span>
                        </span>
                        <span className="pb-[0.18em] text-4xl text-[var(--lp-dim)] md:text-6xl">+</span>
                        <span className="pb-[0.06em] text-[14vw] tabular-nums md:text-[7rem]">
                            <span className="text-[var(--lp-brand-soft)]">₱</span>
                            <CountUp to={15} />
                        </span>
                    </div>
                    <p className="mt-4 lp-mono text-[11px] uppercase tracking-[0.3em] text-[var(--lp-dim)]">
                        per ticket sold
                    </p>
                </Reveal>

                <Reveal delay={0.12}>
                    <p className="max-w-xl text-balance text-lg leading-relaxed text-[var(--lp-muted)]">
                        No monthly fees, no setup cost. You keep the rest — free events stay free to run.
                    </p>
                </Reveal>

                <Reveal delay={0.18}>
                    <Magnetic strength={0.2}>
                        <Link
                            href="/pricing"
                            className="group inline-flex items-center gap-2 rounded-full border border-[var(--lp-line-strong)] px-7 py-3.5 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--lp-text)] transition-colors hover:border-[var(--lp-brand-soft)] hover:bg-[var(--lp-brand)]/10"
                        >
                            See full pricing
                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </Link>
                    </Magnetic>
                </Reveal>
            </div>
        </section>
    );
}
