"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Star, Shield, TrendingUp } from "lucide-react";
import Link from "next/link";

export default function PartnerCTA() {
    return (
        <section className="relative w-full py-32 bg-primary overflow-hidden">
            {/* Decorative physics-like backgrounds */}
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                <div className="absolute top-10 left-10 w-64 h-64 bg-white rounded-full blur-3xl animate-pulse" />
                <div className="absolute bottom-10 right-10 w-96 h-96 bg-white rounded-full blur-3xl animate-pulse" />
            </div>

            <div className="container relative z-10 mx-auto px-4">
                <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center gap-16">

                    <div className="flex-1 space-y-8 text-white">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            className="inline-block px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-sm font-bold tracking-widest uppercase"
                        >
                            Become a Partner
                        </motion.div>

                        <motion.h2
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="text-5xl md:text-7xl font-headline font-bold leading-none tracking-tighter"
                        >
                            OWN THE VIBE. <br />
                            <span className="opacity-80">HOST THE CHANGE.</span>
                        </motion.h2>

                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.2 }}
                            className="text-xl md:text-2xl opacity-90 font-light leading-relaxed"
                        >
                            A curated social marketplace for real-world connection.
                            Build your community, host meaningful interactions, and maximize your impact with our frictionless toolkit.
                        </motion.p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4">
                            <div className="flex items-center gap-4 group">
                                <div className="p-3 rounded-2xl bg-white/10 group-hover:bg-white/20 transition-colors">
                                    <Star className="h-6 w-6" />
                                </div>
                                <div>
                                    <p className="font-bold">Instant Payouts</p>
                                    <p className="text-sm opacity-70">Focus on the event, not the bank.</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 group">
                                <div className="p-3 rounded-2xl bg-white/10 group-hover:bg-white/20 transition-colors">
                                    <Shield className="h-6 w-6" />
                                </div>
                                <div>
                                    <p className="font-bold">Curation Controls</p>
                                    <p className="text-sm opacity-70">Define who joins your crew.</p>
                                </div>
                            </div>
                        </div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.4 }}
                        >
                            <Link href="/organizer/login">
                                <Button
                                    size="lg"
                                    className="bg-white text-primary hover:bg-white/90 rounded-full px-12 py-8 text-2xl font-bold shadow-2xl transition-all hover:scale-105 active:scale-95"
                                >
                                    Become a Partner
                                    <ArrowRight className="ml-3 h-6 w-6" />
                                </Button>
                            </Link>
                        </motion.div>
                    </div>

                    <div className="flex-1 w-full max-w-md">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8, rotate: -5 }}
                            whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
                            viewport={{ once: true }}
                            className="relative aspect-square bg-white/5 rounded-[60px] border border-white/10 backdrop-blur-sm flex items-center justify-center shadow-inner overflow-hidden"
                        >
                            {/* Inner graphic representing metrics/growth */}
                            <div className="p-12 space-y-8 w-full">
                                <div className="h-2 w-2/3 bg-white/20 rounded-full" />
                                <div className="h-2 w-full bg-white/20 rounded-full" />
                                <div className="space-y-4 pt-4">
                                    <div className="flex items-end gap-2 h-32">
                                        <div className="flex-1 bg-white/40 rounded-t-xl animate-grow h-[40%]" />
                                        <div className="flex-1 bg-white/60 rounded-t-xl animate-grow h-[70%]" />
                                        <div className="flex-1 bg-white/80 rounded-t-xl animate-grow h-[90%]" />
                                        <div className="flex-1 bg-white rounded-t-xl animate-grow h-[100%]" />
                                    </div>
                                    <div className="flex justify-between text-white/40 text-xs font-bold uppercase tracking-widest pt-2">
                                        <span>Reach</span>
                                        <span>Engagement</span>
                                    </div>
                                </div>
                            </div>

                            {/* Floating "Badge" */}
                            <div className="absolute top-8 right-8 bg-black text-white px-6 py-4 rounded-3xl transform rotate-12 shadow-2xl font-bold text-lg animate-bounce">
                                🚀 0% Fees
                            </div>
                        </motion.div>
                    </div>

                </div>
            </div>
        </section>
    );
}
