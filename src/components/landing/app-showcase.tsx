"use client";

import { motion } from "framer-motion";
import {
    Utensils,
    Users,
    MessageCircle,
    MapPin,
    ShieldCheck,
    Sparkles
} from "lucide-react";

const features = [
    {
        icon: Utensils,
        title: "Host a Table",
        description: "Craving sushi but your friends are busy? Create a 'Table' at your favorite spot. It's an open invitation for others to join you.",
        color: "bg-orange-100 text-orange-600",
    },
    {
        icon: Users,
        title: "Curate Your Crew",
        description: "Review join requests and approve guests based on their profiles. You always have control over who joins your table.",
        color: "bg-blue-100 text-blue-600",
    },
    {
        icon: MessageCircle,
        title: "Chat & Coordinate",
        description: "Once approved, a group chat unlocks automatically. Break the ice, coordinate details, and get hyped before you meet.",
        color: "bg-purple-100 text-purple-600",
    },
    {
        icon: MapPin,
        title: "Real-Time Connections",
        description: "Our smart geofencing knows when you arrive. Unlock check-ins, mark attendance, and enjoy the moment without tech getting in the way.",
        color: "bg-green-100 text-green-600",
    },
];

export default function AppShowcase() {
    return (
        <section className="relative w-full py-24 md:py-32 bg-secondary/30 overflow-hidden">
            <div className="container relative z-10 mx-auto px-4">
                {/* Section Header */}
                <div className="max-w-3xl mx-auto text-center mb-20 space-y-6">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-bold text-sm uppercase tracking-wider"
                    >
                        <Sparkles className="h-4 w-4" />
                        The HangHut App
                    </motion.div>

                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-4xl md:text-6xl font-headline font-bold tracking-tighter"
                    >
                        Airbnb for <span className="text-primary italic">Social Plans</span>
                    </motion.h2>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="text-xl text-muted-foreground font-light max-w-2xl mx-auto"
                    >
                        Solved the "I want to do this, but my friends are busy" problem.
                        Connect with new people who want to do exactly what you want to do.
                    </motion.p>
                </div>

                {/* Feature Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 max-w-5xl mx-auto">
                    {features.map((feature, index) => {
                        const Icon = feature.icon;
                        return (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1 }}
                                className="flex flex-col sm:flex-row gap-6 p-8 rounded-3xl bg-background border border-border/50 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                            >
                                <div className={`shrink-0 w-16 h-16 rounded-2xl ${feature.color} flex items-center justify-center`}>
                                    <Icon className="w-8 h-8" />
                                </div>
                                <div className="space-y-3">
                                    <h3 className="text-2xl font-bold">{feature.title}</h3>
                                    <p className="text-muted-foreground leading-relaxed">
                                        {feature.description}
                                    </p>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Safety Note */}
                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.5 }}
                    className="mt-16 text-center"
                >
                    <div className="inline-flex items-center gap-2 bg-background/50 backdrop-blur px-6 py-3 rounded-full border border-border/50 text-muted-foreground text-sm">
                        <ShieldCheck className="h-4 w-4 text-green-500" />
                        <span>Profiles are verified for safety. You're in control.</span>
                    </div>
                </motion.div>
            </div>
        </section>
    );
}
