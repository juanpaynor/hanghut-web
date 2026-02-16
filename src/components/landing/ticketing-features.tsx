"use client";

import { motion } from "framer-motion";
import {
    Check,
    X,
    MessageCircle,
    Megaphone,
    Heart,
    Mail,
    Repeat,
    Zap
} from "lucide-react";

export function TicketingFeatures() {
    return (
        <section className="py-24 bg-background relative overflow-hidden">
            <div className="container px-4 mx-auto space-y-32">

                {/* 1. Fee Comparison */}
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-16 space-y-4">
                        <h2 className="text-4xl md:text-5xl font-headline font-bold">
                            Stop Overpaying for Ticketing
                        </h2>
                        <p className="text-xl text-muted-foreground font-light max-w-2xl mx-auto">
                            Keep more of your hard-earned revenue. We offer one of the lowest fees in the industry.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
                        {/* Competitor Card */}
                        <motion.div
                            initial={{ opacity: 0, x: -50 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            className="p-8 rounded-3xl border border-red-100 bg-red-50/30 space-y-6"
                        >
                            <div className="flex items-center justify-between">
                                <h3 className="text-2xl font-bold text-red-900/50">Other Platforms</h3>
                                <X className="h-8 w-8 text-red-300" />
                            </div>
                            <ul className="space-y-4">
                                <li className="flex items-center gap-3 text-red-900/60">
                                    <X className="h-5 w-5 shrink-0" />
                                    <span>High Service Fees (7%+)</span>
                                </li>
                                <li className="flex items-center gap-3 text-red-900/60">
                                    <X className="h-5 w-5 shrink-0" />
                                    <span>Extra Payment Processing Fees</span>
                                </li>
                                <li className="flex items-center gap-3 text-red-900/60">
                                    <X className="h-5 w-5 shrink-0" />
                                    <span>Charge for Email Marketing</span>
                                </li>
                                <li className="flex items-center gap-3 text-red-900/60">
                                    <X className="h-5 w-5 shrink-0" />
                                    <span>Paid Check-in Apps</span>
                                </li>
                            </ul>
                        </motion.div>

                        {/* HangHut Card */}
                        <motion.div
                            initial={{ opacity: 0, x: 50 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            className="relative p-10 rounded-3xl border-2 border-primary bg-background shadow-2xl scale-105"
                        >
                            <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-6 py-2 rounded-full font-bold text-sm uppercase tracking-wider shadow-lg">
                                Best Value
                            </div>
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="text-3xl font-headline font-bold text-primary">HangHut</h3>
                                <Check className="h-10 w-10 text-primary" />
                            </div>
                            <ul className="space-y-5">
                                <li className="flex items-center gap-4 text-lg font-medium">
                                    <div className="p-1 rounded-full bg-green-100 text-green-600">
                                        <Check className="h-4 w-4" />
                                    </div>
                                    <span>Low Standard Fee</span>
                                </li>
                                <li className="flex items-center gap-4 text-lg font-medium">
                                    <div className="p-1 rounded-full bg-green-100 text-green-600">
                                        <Check className="h-4 w-4" />
                                    </div>
                                    <span>Free Payment Processing</span>
                                </li>
                                <li className="flex items-center gap-4 text-lg font-medium">
                                    <div className="p-1 rounded-full bg-green-100 text-green-600">
                                        <Check className="h-4 w-4" />
                                    </div>
                                    <span><span className="text-primary font-bold">Free</span> Unlimited Email Marketing</span>
                                </li>
                                <li className="flex items-center gap-4 text-lg font-medium">
                                    <div className="p-1 rounded-full bg-green-100 text-green-600">
                                        <Check className="h-4 w-4" />
                                    </div>
                                    <span>Free Check-in App</span>
                                </li>
                            </ul>
                        </motion.div>
                    </div>
                </div>

                {/* 2. Customer Interaction */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                    <div className="order-2 lg:order-1 relative">
                        {/* Visual Representation of Chat/Interaction */}
                        <div className="relative aspect-square rounded-[40px] bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-100 backdrop-blur-sm overflow-hidden p-8 flex flex-col justify-center gap-4">
                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                whileInView={{ y: 0, opacity: 1 }}
                                viewport={{ once: true }}
                                className="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm max-w-[80%] self-start"
                            >
                                <p className="text-sm font-medium text-foreground/80">Hey! Is there parking nearby?</p>
                            </motion.div>
                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                whileInView={{ y: 0, opacity: 1 }}
                                viewport={{ once: true }}
                                transition={{ delay: 0.2 }}
                                className="bg-primary text-primary-foreground p-4 rounded-2xl rounded-tr-none shadow-lg max-w-[80%] self-end"
                            >
                                <p className="text-sm font-medium">Yes! We have a dedicated lot right next door. See you soon! 👋</p>
                            </motion.div>
                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                whileInView={{ y: 0, opacity: 1 }}
                                viewport={{ once: true }}
                                transition={{ delay: 0.4 }}
                                className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex items-center gap-3 mt-4"
                            >
                                <Megaphone className="h-5 w-5 text-indigo-500" />
                                <div>
                                    <p className="text-xs font-bold text-indigo-700 uppercase">Announcement</p>
                                    <p className="text-sm text-indigo-900">Doors open 15 mins early today! 🎉</p>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                    <div className="order-1 lg:order-2 space-y-6">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 text-indigo-600 font-bold text-xs uppercase tracking-wider">
                            <MessageCircle className="h-3 w-3" />
                            Deep Engagement
                        </div>
                        <h2 className="text-4xl md:text-5xl font-headline font-bold">
                            Interact With Your Audience
                        </h2>
                        <p className="text-xl text-muted-foreground font-light leading-relaxed">
                            Don't just sell tickets—build a community. Direct messaging, announcements, and post-event feedback are built right in.
                        </p>
                        <ul className="space-y-4 pt-4">
                            <li className="flex items-center gap-3 text-lg">
                                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                                    <MessageCircle className="h-5 w-5" />
                                </div>
                                <span>Direct Message Attendees</span>
                            </li>
                            <li className="flex items-center gap-3 text-lg">
                                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                                    <Megaphone className="h-5 w-5" />
                                </div>
                                <span>Send Push Notifications</span>
                            </li>
                            <li className="flex items-center gap-3 text-lg">
                                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                                    <Heart className="h-5 w-5" />
                                </div>
                                <span>Collect Feedback & Reviews</span>
                            </li>
                        </ul>
                    </div>
                </div>

                {/* 3. Built-in Marketing */}
                <div className="rounded-[40px] bg-black text-white p-8 md:p-16 overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-primary/30 to-purple-500/30 blur-[100px] rounded-full pointer-events-none" />

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 relative z-10 items-center">
                        <div className="space-y-8">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white font-bold text-xs uppercase tracking-wider border border-white/20">
                                <Zap className="h-3 w-3 text-yellow-400" />
                                Included For Free
                            </div>
                            <h2 className="text-4xl md:text-5xl font-headline font-bold">
                                Built-in Marketing Suite <br />
                                <span className="text-primary italic">($0/month value)</span>
                            </h2>
                            <p className="text-xl text-white/70 font-light leading-relaxed">
                                Stop paying for Mailchimp. Our automated email system engages your audience at the right time, completely free.
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                                    <Mail className="h-6 w-6 text-primary mb-3" />
                                    <h4 className="font-bold mb-1">Automated Reminders</h4>
                                    <p className="text-sm text-white/60">Reduce no-shows with smart nudges.</p>
                                </div>
                                <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                                    <Repeat className="h-6 w-6 text-primary mb-3" />
                                    <h4 className="font-bold mb-1">Re-engagement</h4>
                                    <p className="text-sm text-white/60">Invite past attendees to new events.</p>
                                </div>
                            </div>
                        </div>

                        <div className="relative">
                            {/* Marketing UI Mockup */}
                            <motion.div
                                initial={{ opacity: 0, rotate: 6, y: 50 }}
                                whileInView={{ opacity: 1, rotate: 6, y: 0 }}
                                viewport={{ once: true }}
                                className="bg-white text-black p-6 rounded-3xl shadow-2xl max-w-sm mx-auto rotate-6 hover:rotate-0 transition-transform duration-500"
                            >
                                <div className="flex items-center justify-between mb-6 border-b pb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full bg-primary" />
                                        <div className="space-y-1">
                                            <div className="h-2 w-24 bg-gray-200 rounded-full" />
                                            <div className="h-2 w-16 bg-gray-100 rounded-full" />
                                        </div>
                                    </div>
                                    <div className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-md">Sent</div>
                                </div>
                                <div className="space-y-3">
                                    <div className="h-4 w-3/4 bg-gray-200 rounded-full" />
                                    <div className="h-3 w-full bg-gray-100 rounded-full" />
                                    <div className="h-3 w-full bg-gray-100 rounded-full" />
                                    <div className="h-3 w-5/6 bg-gray-100 rounded-full" />
                                </div>
                                <div className="mt-6 pt-4 border-t flex justify-between items-center text-xs text-gray-400">
                                    <span>Open Rate: 68%</span>
                                    <span>Clicks: 42%</span>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </div>

            </div>
        </section>
    );
}
