"use client";

import { motion } from "framer-motion";
import { Ticket, ScanLine, BarChart3, Smartphone, Zap, Globe, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export function OrganizerFeatures() {
    return (
        <section className="w-full">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:auto-rows-[300px]">

                {/* 1. Hybrid Ticketing (Hero Block - Top Left - 2 Cols) */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                    className="group md:col-span-2 relative overflow-hidden rounded-[40px] border border-white/20 bg-white/40 backdrop-blur-xl p-8 shadow-xl transition-all hover:shadow-2xl hover:border-indigo-200/50"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 via-purple-50/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    <div className="relative z-10 h-full flex flex-col justify-between">
                        <div className="space-y-2">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-3 rounded-2xl bg-white shadow-sm border border-indigo-100 text-indigo-600">
                                    <Ticket className="h-6 w-6" />
                                </div>
                                <h3 className="text-2xl font-bold font-headline">Hybrid Ticketing Engine</h3>
                            </div>
                            <p className="text-muted-foreground max-w-md">
                                The best of both worlds. Capture web traffic instantly, while driving app downloads for long-term engagement.
                            </p>
                        </div>

                        {/* Interactive Visual */}
                        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="p-4 rounded-3xl bg-white/60 border border-white/40 shadow-sm transition-transform group-hover:-translate-y-1">
                                <div className="flex items-center gap-2 mb-2 text-indigo-600">
                                    <Globe className="h-4 w-4" />
                                    <span className="font-bold text-sm">Guest Checkout</span>
                                </div>
                                <div className="text-xs text-muted-foreground font-medium mb-1">Web • No Account Needed</div>
                                <div className="text-2xl font-bold">15s</div>
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg. Time to Purchase</div>
                            </div>

                            <div className="p-4 rounded-3xl bg-indigo-600/90 text-white shadow-lg shadow-indigo-500/20 transition-transform group-hover:-translate-y-1 delay-75">
                                <div className="flex items-center gap-2 mb-2 text-indigo-100">
                                    <Smartphone className="h-4 w-4" />
                                    <span className="font-bold text-sm">App Experience</span>
                                </div>
                                <div className="text-xs text-indigo-200 font-medium mb-1">Exclusive Perks • Stamps</div>
                                <div className="text-2xl font-bold">+40%</div>
                                <div className="text-[10px] text-indigo-200 uppercase tracking-wider">Higher Retention</div>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* 2. Scanner / Entry Mgmt (Tall Block - Right - 1 Col, 2 Row Span) */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    className="md:row-span-2 relative overflow-hidden rounded-[40px] border border-white/20 bg-slate-900 text-white p-8 shadow-xl transition-all hover:shadow-2xl group"
                >
                    {/* Dark/Scanner Aesthetic */}
                    <div className="absolute inset-0 bg-gradient-to-b from-slate-800 to-slate-950" />
                    <div className="absolute inset-0 opacity-20 noise-texture" />

                    {/* Scanner Beam Effect */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-green-500/50 blur-md shadow-[0_0_20px_rgba(34,197,94,0.5)] animate-scan-y pointer-events-none" />

                    <div className="relative z-10 h-full flex flex-col">
                        <div className="mb-auto space-y-4">
                            <div className="p-3 w-fit rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 text-green-400">
                                <ScanLine className="h-6 w-6" />
                            </div>
                            <h3 className="text-2xl font-bold font-headline">Entry Management</h3>
                            <p className="text-slate-400 text-sm leading-relaxed">
                                Process 1,000+ guests per hour with our lightning-fast scanner app. Works offline.
                            </p>
                        </div>

                        {/* Visual Mockup */}
                        <div className="mt-8 relative mx-auto w-48 h-80 bg-slate-800 rounded-[2.5rem] border-4 border-slate-700 shadow-2xl overflow-hidden">
                            <div className="absolute top-0 inset-x-0 h-6 bg-slate-900 z-20 rounded-b-xl" />

                            {/* Success Screen Mockup */}
                            <div className="h-full w-full bg-slate-900 flex flex-col items-center justify-center relative p-6 text-center space-y-4">
                                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center animate-pulse">
                                    <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                                        <CheckIcon className="w-6 h-6 text-slate-900 stroke-[4]" />
                                    </div>
                                </div>
                                <div>
                                    <div className="text-white font-bold text-lg">Valid Ticket</div>
                                    <div className="text-green-400 text-sm font-mono">VIP ACCESS</div>
                                </div>
                                <div className="p-3 rounded-xl bg-slate-800 w-full">
                                    <div className="h-2 w-20 bg-slate-700 rounded mb-2 mx-auto" />
                                    <div className="h-2 w-12 bg-slate-700 rounded mx-auto" />
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* 3. Analytics (Bottom Left - 2 Cols) */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="md:col-span-2 relative overflow-hidden rounded-[40px] border border-white/20 bg-white/40 backdrop-blur-xl p-8 shadow-xl transition-all hover:shadow-2xl group"
                >
                    <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-pink-500/10 rounded-full blur-3xl group-hover:bg-pink-500/20 transition-colors" />

                    <div className="relative z-10 flex flex-col md:flex-row gap-8 items-center h-full">
                        <div className="flex-1 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="p-3 rounded-2xl bg-white shadow-sm border border-pink-100 text-pink-500">
                                    <BarChart3 className="h-6 w-6" />
                                </div>
                                <h3 className="text-2xl font-bold font-headline">Real-Time Command Center</h3>
                            </div>
                            <p className="text-muted-foreground">
                                Watch revenue flow in live. Track scans, monitor capacity, and identify your top promoters instantly.
                            </p>
                            <div className="flex gap-2">
                                <Badge className="bg-pink-100 text-pink-700 hover:bg-pink-200">Live Sales</Badge>
                                <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200">Crowd Density</Badge>
                                <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-200">Promoter ROI</Badge>
                            </div>
                        </div>

                        {/* Chart Graphic */}
                        <div className="flex-1 w-full max-w-xs p-4 bg-white/80 rounded-3xl border border-white/40 shadow-sm hover:scale-[1.02] transition-transform duration-500">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-xs font-bold text-muted-foreground uppercase">Revenue</span>
                                <span className="text-xs font-bold text-green-600 flex items-center gap-1">
                                    <Zap className="w-3 h-3" /> Live
                                </span>
                            </div>
                            <div className="flex items-end gap-1 h-24 mb-2">
                                {[30, 45, 35, 60, 50, 75, 90].map((h, i) => (
                                    <div
                                        key={i}
                                        className="flex-1 bg-slate-900 rounded-t-sm opacity-20 hover:opacity-100 hover:bg-indigo-600 transition-all cursor-crosshair"
                                        style={{ height: `${h}%` }}
                                    />
                                ))}
                            </div>
                            <div className="flex justify-between items-baseline">
                                <div className="text-2xl font-bold text-slate-900">$12,450</div>
                                <div className="text-xs text-muted-foreground">Today</div>
                            </div>
                        </div>
                    </div>
                </motion.div>

            </div>
        </section>
    );
}

// Simple internal component for the check icon in scanner mockup
function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polyline points="20 6 9 17 4 12" />
        </svg>
    )
}

function Badge({ children, className }: { children: React.ReactNode, className?: string }) {
    return (
        <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2", className)}>
            {children}
        </span>
    )
}
