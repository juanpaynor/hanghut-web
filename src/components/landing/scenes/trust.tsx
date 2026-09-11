"use client";

import { BadgeCheck, CreditCard, MapPin, ShieldCheck } from "lucide-react";
import { Reveal, SceneLabel } from "./primitives";

const TRUST = [
    { icon: CreditCard, title: "Xendit-powered payments", body: "Cards, GCash, Maya & QRPh — settled to your account." },
    { icon: ShieldCheck, title: "Secure checkout", body: "PCI-compliant processing on every transaction." },
    { icon: MapPin, title: "Built for the Philippines", body: "Local rails, local pricing, local support." },
    { icon: BadgeCheck, title: "Verified hosts", body: "Curated, reviewed organizers and experiences." },
];

/** Scene 05 — the reassurance band. Four facts, no card chrome. */
export default function Trust() {
    return (
        <section className="relative py-20 md:py-28">
            <div className="mx-auto max-w-7xl px-6 md:px-12">
                <Reveal className="mb-14">
                    <SceneLabel index="05" label="Why it holds up" />
                </Reveal>

                <div className="grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-[var(--lp-line)] bg-[var(--lp-line)] sm:grid-cols-2 lg:grid-cols-4">
                    {TRUST.map((t, i) => {
                        const Icon = t.icon;
                        return (
                            <Reveal key={t.title} delay={(i % 4) * 0.07} className="h-full">
                                <div className="group flex h-full flex-col gap-4 bg-[var(--lp-void)] p-8 transition-colors duration-500 hover:bg-[var(--lp-deep)]">
                                    <Icon className="h-6 w-6 text-[var(--lp-brand-soft)] transition-transform duration-500 group-hover:-translate-y-0.5" />
                                    <h3 className="text-base font-semibold text-[var(--lp-text)]">{t.title}</h3>
                                    <p className="text-sm leading-relaxed text-[var(--lp-muted)]">{t.body}</p>
                                </div>
                            </Reveal>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
