"use client";

import { motion } from "framer-motion";
import {
    CalendarPlus,
    Megaphone,
    CreditCard,
    ScanLine,
    Banknote,
    ArrowRight,
    Sparkles
} from "lucide-react";

const steps = [
    {
        number: "01",
        icon: CalendarPlus,
        title: "Create Your Event",
        description: "Set up your event in minutes with our intuitive dashboard. Add details, pricing, and branding.",
        color: "from-blue-500 to-cyan-500",
        bgColor: "bg-blue-50",
    },
    {
        number: "02",
        icon: Megaphone,
        title: "Get Discovered — For Free",
        description: "Your event automatically appears on our social app to thousands of users. No paid ads, no marketing budget needed. We promote your event organically to locals and travelers looking for things to do.",
        color: "from-purple-500 to-pink-500",
        bgColor: "bg-purple-50",
    },
    {
        number: "03",
        icon: CreditCard,
        title: "Sell Tickets Securely",
        description: "Accept payments instantly with Xendit. We handle the checkout, you focus on the experience.",
        color: "from-green-500 to-emerald-500",
        bgColor: "bg-green-50",
    },
    {
        number: "04",
        icon: ScanLine,
        title: "Manage Attendees",
        description: "Scan QR codes at the door. Track check-ins in real-time. Keep your event running smoothly.",
        color: "from-orange-500 to-red-500",
        bgColor: "bg-orange-50",
    },
    {
        number: "05",
        icon: Banknote,
        title: "Get Paid Instantly",
        description: "Request payouts anytime. Money hits your account fast. No waiting, no hassle.",
        color: "from-yellow-500 to-amber-500",
        bgColor: "bg-yellow-50",
    },
];

export default function HowItWorks() {
    return (
        <section className="relative w-full py-32 bg-background overflow-hidden">
            {/* Background decoration */}
            <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/20 to-background pointer-events-none" />

            <div className="container relative z-10 mx-auto px-4">
                {/* Header */}
                <div className="max-w-3xl mx-auto mb-20 text-center space-y-6">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-bold text-sm uppercase tracking-wider"
                    >
                        <Sparkles className="h-4 w-4" />
                        How It Works
                    </motion.div>

                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-5xl md:text-7xl font-headline font-bold tracking-tighter"
                    >
                        From Idea to{" "}
                        <span className="text-primary italic">Sold Out</span>
                    </motion.h2>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="text-xl md:text-2xl text-muted-foreground font-light"
                    >
                        Five simple steps to host unforgettable events and grow your community.
                    </motion.p>
                </div>

                {/* Steps */}
                <div className="max-w-6xl mx-auto space-y-8">
                    {steps.map((step, index) => {
                        const Icon = step.icon;
                        return (
                            <motion.div
                                key={step.number}
                                initial={{ opacity: 0, x: index % 2 === 0 ? -50 : 50 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true, margin: "-100px" }}
                                transition={{ delay: index * 0.1 }}
                                className="group"
                            >
                                <div className="relative flex flex-col md:flex-row items-center gap-8 p-8 md:p-12 rounded-3xl border-2 border-border/50 bg-card hover:border-primary/50 transition-all duration-300 hover:shadow-2xl hover:scale-[1.02]">
                                    {/* Step Number */}
                                    <div className="absolute -top-6 -left-6 w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-2xl shadow-lg transform -rotate-6 group-hover:rotate-0 transition-transform">
                                        {step.number}
                                    </div>

                                    {/* Icon */}
                                    <div className={`shrink-0 w-24 h-24 rounded-2xl bg-gradient-to-br ${step.color} p-6 text-white shadow-xl group-hover:scale-110 transition-transform`}>
                                        <Icon className="w-full h-full" strokeWidth={1.5} />
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 text-center md:text-left space-y-3">
                                        <h3 className="text-3xl md:text-4xl font-bold tracking-tight">
                                            {step.title}
                                        </h3>
                                        <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
                                            {step.description}
                                        </p>
                                    </div>

                                    {/* Arrow (desktop only) */}
                                    {index < steps.length - 1 && (
                                        <div className="hidden md:block absolute -bottom-12 left-1/2 -translate-x-1/2 text-muted-foreground/30">
                                            <ArrowRight className="w-8 h-8 rotate-90" />
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Bottom CTA */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="mt-20 text-center space-y-6"
                >
                    <div className="inline-block p-1 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-500 mb-4">
                        <div className="bg-background rounded-xl px-6 py-3">
                            <p className="text-sm font-bold text-green-600">
                                ✨ Free organic promotion to thousands of users
                            </p>
                        </div>
                    </div>

                    <p className="text-2xl text-muted-foreground font-light">
                        Ready to bring your community together?
                    </p>

                    <div className="inline-block p-1 rounded-full bg-gradient-to-r from-primary to-purple-500">
                        <div className="bg-background rounded-full px-8 py-3">
                            <p className="text-sm font-bold text-primary">
                                🎉 Join 500+ event organizers already using HangHut
                            </p>
                        </div>
                    </div>
                </motion.div>
            </div>
        </section>
    );
}
