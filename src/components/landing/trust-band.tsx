"use client";

import { ShieldCheck, CreditCard, MapPin, BadgeCheck } from "lucide-react";
import { Reveal } from "@/components/landing/reveal";

const TRUST = [
    { icon: CreditCard, title: "Xendit-powered payments", body: "Cards, GCash, Maya & QRPh — settled to your account." },
    { icon: ShieldCheck, title: "Secure checkout", body: "PCI-compliant processing on every transaction." },
    { icon: MapPin, title: "Built for the Philippines", body: "Local rails, local pricing, local support." },
    { icon: BadgeCheck, title: "Verified hosts", body: "Curated, reviewed organizers and experiences." },
];

export default function TrustBand() {
    return (
        <section className="bg-kinetic-ink py-20">
            <div className="mx-auto max-w-7xl px-6 md:px-12">
                <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
                    {TRUST.map((t, i) => {
                        const Icon = t.icon;
                        return (
                            <Reveal key={t.title} delay={(i % 4) * 0.06}>
                                <div className="flex flex-col gap-3">
                                    <Icon className="h-6 w-6 text-kinetic-brand" />
                                    <h3 className="text-base font-bold text-kinetic-text">{t.title}</h3>
                                    <p className="text-sm leading-relaxed text-kinetic-muted">{t.body}</p>
                                </div>
                            </Reveal>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
