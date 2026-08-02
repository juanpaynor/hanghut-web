"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { StoreButtons } from "@/components/landing/store-buttons";

export default function CTASection() {
    const reduce = useReducedMotion();
    const rise = reduce ? {} : { initial: { opacity: 0, y: 30 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.4 }, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } };

    return (
        <section className="bg-kinetic-ink px-6 py-24 md:px-12 md:py-32">
            <motion.div
                {...rise}
                className="relative mx-auto max-w-6xl overflow-hidden rounded-[40px] bg-kinetic-brand px-8 py-20 text-kinetic-brand-fg md:px-16"
            >
                {/* subtle grid texture on the brand panel */}
                <div
                    className="pointer-events-none absolute inset-0 opacity-[0.12]"
                    style={{
                        backgroundImage: "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
                        backgroundSize: "48px 48px",
                    }}
                />
                <div className="relative">
                    <h2 className="max-w-3xl font-headline text-5xl font-extrabold leading-[0.92] tracking-tight md:text-7xl">
                        Your next sold-out night starts here.
                    </h2>

                    <div className="mt-10 grid gap-10 md:grid-cols-2">
                        {/* Organizer */}
                        <div className="border-t border-kinetic-brand-fg/25 pt-6">
                            <p className="font-body text-xs uppercase tracking-[0.25em] text-kinetic-brand-fg/70">For organizers</p>
                            <p className="mt-3 max-w-sm text-lg font-medium">Sell tickets, map seats, get paid.</p>
                            <Link
                                href="/organizer/login"
                                className="group mt-5 inline-flex items-center gap-2 rounded-full bg-kinetic-ink px-6 py-3 text-sm font-bold uppercase tracking-wide text-kinetic-brand transition-transform hover:scale-[1.03]"
                            >
                                Start selling
                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                            </Link>
                        </div>
                        {/* Attendee */}
                        <div className="border-t border-kinetic-brand-fg/25 pt-6">
                            <p className="font-body text-xs uppercase tracking-[0.25em] text-kinetic-brand-fg/70">For everyone else</p>
                            <p className="mt-3 max-w-sm text-lg font-medium">Discover events and real hangouts near you.</p>
                            <div className="mt-5">
                                <StoreButtons variant="dark" />
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </section>
    );
}
