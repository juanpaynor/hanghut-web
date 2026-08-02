"use client";

import { motion } from "motion/react";
import { Check, X, Store, Zap, Repeat, ShieldCheck } from "lucide-react";
import { PartnerFeeCalculator } from "@/components/landing/partner-fee-calculator";

const INCLUDED = [
    "Free organizer storefront",
    "Free custom domain",
    "Free QR check-in app",
    "Free email marketing",
    "Free promo codes",
    "Free event analytics",
    "Free seat map builder",
    "Free attendee management",
];

const COMPARISON = [
    { feature: "Platform Fee", others: "7% – 15%", us: "2% + ₱15" },
    { feature: "Payment Processing Fee", others: "Included in their %", us: "~1.4% – 3.2% (Xendit)" },
    { feature: "Monthly Subscription", others: "₱500 – ₱5,000/mo", us: "Free" },
    { feature: "Organizer Storefront", others: "Paid add-on", us: "Free" },
    { feature: "Custom Domain", others: "Not available", us: "Free" },
    { feature: "Email Marketing", others: "Paid (Mailchimp etc.)", us: "Free & built-in" },
    { feature: "QR Check-in App", others: "Paid add-on", us: "Free" },
    { feature: "Promo Codes", others: "Paid tier", us: "Free" },
    { feature: "Multiple Ticket Tiers", others: "Paid tier", us: "Free" },
    { feature: "Seat Map Builder", others: "Not available / Paid", us: "Free" },
    { feature: "Social App Discovery", others: "Not available", us: "Free" },
];

const TRUST = [
    { icon: ShieldCheck, title: "Secure payments", body: "Powered by Xendit — a licensed PH payment provider." },
    { icon: Zap, title: "Instant setup", body: "Create an event and start selling in minutes." },
    { icon: Repeat, title: "No lock-in", body: "Pay-per-sale only. Leave anytime, no penalties." },
    { icon: Store, title: "Everything included", body: "Storefront, check-in, marketing — all free." },
];

/**
 * Self-contained pricing section — the "Just 2%" fee card, interactive calculator,
 * trust band and competitor comparison. Reused on both the Become-a-Partner
 * (/ticketing) page and the standalone /pricing page.
 */
export function PricingSection() {
    return (
        <section className="py-20 md:py-24 bg-background relative overflow-hidden">
            <div className="container px-4 mx-auto max-w-5xl space-y-16">
                {/* Header */}
                <div className="text-center space-y-4">
                    <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary">Pricing</p>
                    <h2 className="text-4xl md:text-5xl font-headline font-bold">One fee. Everything included.</h2>
                    <p className="text-xl text-muted-foreground font-light max-w-2xl mx-auto">
                        No monthly subscriptions. No setup fees. You only pay when you make money.
                    </p>
                </div>

                {/* Fee highlight card */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="relative p-10 rounded-3xl border-2 border-primary bg-background shadow-2xl max-w-lg mx-auto text-center"
                >
                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-6 py-2 rounded-full font-bold text-sm uppercase tracking-wider shadow-lg whitespace-nowrap">
                        ✨ One Plan. Everything Included.
                    </div>
                    <div className="mt-4 space-y-5">
                        <div>
                            <div className="flex items-end justify-center gap-2">
                                <span className="text-7xl font-headline font-black text-primary leading-none">Just 2%</span>
                                <span className="text-2xl font-headline font-bold text-muted-foreground mb-1">+ ₱15</span>
                            </div>
                            <p className="text-xl text-muted-foreground mt-3 font-light">HangHut platform fee per ticket sold</p>
                            <p className="text-sm text-muted-foreground mt-1">
                                Deducted from your payout — or flip a switch to pass it to attendees and keep 100% of your ticket price.
                            </p>
                        </div>

                        <div className="rounded-xl bg-muted/50 border border-border px-5 py-4 text-left space-y-1">
                            <p className="text-sm font-semibold flex items-center gap-2">
                                + ~1.4% – 3.2% payment processing fee
                                <span className="text-xs font-normal text-muted-foreground">(via Xendit)</span>
                            </p>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Charged by Xendit per transaction — rate varies by payment method (QR Ph, e-wallets, cards). Always absorbed by you, never added to your buyers.
                            </p>
                        </div>
                    </div>

                    <div className="mt-8 pt-6 border-t grid grid-cols-2 gap-3 text-left">
                        {INCLUDED.map((item) => (
                            <div key={item} className="flex items-center gap-2 text-sm font-medium">
                                <div className="p-0.5 rounded-full bg-green-100 text-green-600 shrink-0">
                                    <Check className="h-3 w-3" />
                                </div>
                                {item}
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* Interactive calculator */}
                <div>
                    <div className="text-center mb-8 space-y-2">
                        <h3 className="text-2xl md:text-3xl font-headline font-bold">Do the math</h3>
                        <p className="text-muted-foreground">Slide the numbers and see exactly what lands in your account.</p>
                    </div>
                    <PartnerFeeCalculator />
                </div>

                {/* Trust band */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {TRUST.map((t) => (
                        <div key={t.title} className="rounded-2xl border border-border bg-background p-5 text-center">
                            <div className="inline-flex p-2.5 rounded-xl bg-primary/10 text-primary mb-3">
                                <t.icon className="h-5 w-5" />
                            </div>
                            <p className="font-bold text-sm">{t.title}</p>
                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t.body}</p>
                        </div>
                    ))}
                </div>

                {/* Comparison table */}
                <div>
                    <div className="overflow-x-auto rounded-2xl border border-border">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/50">
                                    <th className="text-left p-4 font-semibold text-muted-foreground w-1/3">Feature</th>
                                    <th className="p-4 text-center font-semibold text-red-500 w-1/3">Other Platforms</th>
                                    <th className="p-4 text-center font-bold text-primary w-1/3">HangHut</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {COMPARISON.map((row) => (
                                    <tr key={row.feature} className="hover:bg-muted/30 transition-colors">
                                        <td className="p-4 font-medium">{row.feature}</td>
                                        <td className="p-4 text-center text-red-500/80">
                                            <span className="inline-flex items-center gap-1">
                                                <X className="h-3.5 w-3.5 shrink-0" />
                                                {row.others}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center text-green-600 font-semibold">
                                            <span className="inline-flex items-center gap-1">
                                                <Check className="h-3.5 w-3.5 shrink-0" />
                                                {row.us}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-center text-xs text-muted-foreground mt-4">
                        * Xendit processing fees (~1.4%–3.2%) vary by payment method and are separate from HangHut&apos;s 2% + ₱15 platform fee.
                    </p>
                </div>
            </div>
        </section>
    );
}
