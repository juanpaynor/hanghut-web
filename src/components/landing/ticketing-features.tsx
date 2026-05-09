"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Check,
    X,
    MessageCircle,
    Megaphone,
    Heart,
    Mail,
    Repeat,
    Zap,
    Globe,
    Store,
    ChevronDown,
    ShieldCheck,
    Ticket,
    QrCode,
} from "lucide-react";

const faqs = [
    {
        q: "How much does HangHut charge per ticket?",
        a: "We charge a flat 4% platform fee per ticket sold, deducted from your payout. There are no setup fees, monthly fees, or hidden charges. The 4% covers everything — hosting, infrastructure, support, and your free storefront.",
    },
    {
        q: "Who pays the payment processing fee?",
        a: "Xendit (our payment gateway) charges a processing fee directly on each transaction. You can choose to absorb it yourself, or enable our 'Pass Fee' option to add a small fixed convenience fee to the buyer's total — your call.",
    },
    {
        q: "When do I get paid?",
        a: "Payouts are processed after your event. Funds are transferred to your registered bank account via Xendit. You'll receive a full breakdown of gross sales, platform fees, and net payout in your organizer dashboard.",
    },
    {
        q: "What is the free storefront?",
        a: "Every organizer gets a public storefront at yourbrand.hanghut.com — a branded page listing all your events. Customers can browse and buy tickets directly from your storefront. No extra setup needed, it's live the moment you create your first event.",
    },
    {
        q: "Can I use my own domain?",
        a: "Yes. You can connect a custom domain (e.g. tickets.yourbrand.com) to your storefront. It's a pure white-label experience — no HangHut branding unless you want it. Just add a CNAME record and you're live.",
    },
    {
        q: "Is there a contract or lock-in period?",
        a: "None. HangHut is pay-per-event — you only pay the 4% fee when you make a sale. You can stop using the platform at any time with no penalties.",
    },
    {
        q: "How does the free check-in app work?",
        a: "Your event comes with a built-in QR scanner accessible on any phone through our organizer app. Your staff can scan tickets at the door to validate and check in attendees in real time. No extra hardware or software needed.",
    },
    {
        q: "Can I sell free events?",
        a: "Yes. Free events have zero fees — we don't charge anything if the ticket price is ₱0. It's completely free to use HangHut for free events.",
    },
];

export function TicketingFeatures() {
    const [openFaq, setOpenFaq] = useState<number | null>(null);

    return (
        <section className="py-24 bg-background relative overflow-hidden">
            <div className="container px-4 mx-auto space-y-32">

                {/* 1. Pricing Table */}
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-16 space-y-4">
                        <h2 className="text-4xl md:text-5xl font-headline font-bold">
                            Simple, Honest Pricing
                        </h2>
                        <p className="text-xl text-muted-foreground font-light max-w-2xl mx-auto">
                            No surprises. No tiers. Just one low fee — and everything else is free.
                        </p>
                    </div>

                    {/* Fee Highlight */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="relative p-10 rounded-3xl border-2 border-primary bg-background shadow-2xl max-w-lg mx-auto text-center mb-16"
                    >
                        <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-6 py-2 rounded-full font-bold text-sm uppercase tracking-wider shadow-lg whitespace-nowrap">
                            ✨ One Plan. Everything Included.
                        </div>
                        <div className="mt-4">
                            <span className="text-7xl font-headline font-black text-primary">4%</span>
                            <p className="text-xl text-muted-foreground mt-2 font-light">platform fee per ticket sold</p>
                            <p className="text-sm text-muted-foreground mt-1">Deducted from your payout — buyers pay face value only</p>
                        </div>
                        <div className="mt-8 pt-6 border-t grid grid-cols-2 gap-3 text-left">
                            {[
                                "Free organizer storefront",
                                "Free custom domain",
                                "Free QR check-in app",
                                "Free email marketing",
                                "Free promo codes",
                                "Free event analytics",
                                "Free ticket tiers",
                                "Free attendee management",
                            ].map((item) => (
                                <div key={item} className="flex items-center gap-2 text-sm font-medium">
                                    <div className="p-0.5 rounded-full bg-green-100 text-green-600 shrink-0">
                                        <Check className="h-3 w-3" />
                                    </div>
                                    {item}
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    {/* Comparison Table */}
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
                                {[
                                    { feature: "Platform Fee", others: "7% – 15%", us: "4% flat" },
                                    { feature: "Monthly Subscription", others: "₱500 – ₱5,000/mo", us: "Free" },
                                    { feature: "Organizer Storefront", others: "Paid add-on", us: "Free" },
                                    { feature: "Custom Domain", others: "Not available", us: "Free" },
                                    { feature: "Email Marketing", others: "Paid (Mailchimp etc.)", us: "Free & built-in" },
                                    { feature: "QR Check-in App", others: "Paid add-on", us: "Free" },
                                    { feature: "Promo Codes", others: "Paid tier", us: "Free" },
                                    { feature: "Multiple Ticket Tiers", others: "Paid tier", us: "Free" },
                                    { feature: "Social App Discovery", others: "Not available", us: "Free" },
                                ].map((row) => (
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
                        * Payment gateway processing fees (charged by Xendit) apply per transaction and may be passed to buyers or absorbed by the organizer.
                    </p>
                </div>

                {/* 2. Free Storefront + Custom Domain */}
                <div className="rounded-[40px] bg-black text-white p-8 md:p-16 overflow-hidden relative">
                    <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-gradient-to-br from-primary/20 to-purple-500/20 blur-[100px] rounded-full pointer-events-none" />
                    <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-gradient-to-tl from-blue-500/10 to-transparent blur-[80px] rounded-full pointer-events-none" />

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 relative z-10 items-center">
                        <div className="space-y-8">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white font-bold text-xs uppercase tracking-wider border border-white/20">
                                <Store className="h-3 w-3 text-primary" />
                                100% Free
                            </div>
                            <h2 className="text-4xl md:text-5xl font-headline font-bold leading-tight">
                                Your Own Storefront.<br />
                                <span className="text-primary">Your Own Domain.</span>
                            </h2>
                            <p className="text-xl text-white/70 font-light leading-relaxed">
                                Every organizer gets a free branded storefront where fans can browse all your events and buy tickets directly. Connect your own domain for a complete white-label experience.
                            </p>
                            <ul className="space-y-4">
                                <li className="flex items-start gap-3">
                                    <div className="p-2 rounded-lg bg-white/10 text-primary mt-0.5 shrink-0">
                                        <Store className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <p className="font-semibold">Free Storefront</p>
                                        <p className="text-sm text-white/60">Go live at <span className="text-primary font-mono">yourbrand.hanghut.com</span> instantly — no setup needed.</p>
                                    </div>
                                </li>
                                <li className="flex items-start gap-3">
                                    <div className="p-2 rounded-lg bg-white/10 text-primary mt-0.5 shrink-0">
                                        <Globe className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <p className="font-semibold">Custom Domain</p>
                                        <p className="text-sm text-white/60">Connect <span className="text-primary font-mono">tickets.yourbrand.com</span> with one CNAME record. Pure white-label — no HangHut branding.</p>
                                    </div>
                                </li>
                                <li className="flex items-start gap-3">
                                    <div className="p-2 rounded-lg bg-white/10 text-primary mt-0.5 shrink-0">
                                        <ShieldCheck className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <p className="font-semibold">SSL Included</p>
                                        <p className="text-sm text-white/60">Automatic HTTPS on your custom domain. Secure by default.</p>
                                    </div>
                                </li>
                            </ul>
                        </div>

                        {/* Storefront mockup */}
                        <div className="relative">
                            <motion.div
                                initial={{ opacity: 0, y: 40 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                className="bg-white text-black rounded-2xl shadow-2xl overflow-hidden max-w-sm mx-auto"
                            >
                                {/* Browser chrome */}
                                <div className="bg-gray-100 px-4 py-3 flex items-center gap-2 border-b border-gray-200">
                                    <div className="flex gap-1.5">
                                        <div className="w-3 h-3 rounded-full bg-red-400" />
                                        <div className="w-3 h-3 rounded-full bg-yellow-400" />
                                        <div className="w-3 h-3 rounded-full bg-green-400" />
                                    </div>
                                    <div className="flex-1 bg-white rounded-md px-3 py-1 text-xs text-gray-500 font-mono flex items-center gap-1">
                                        <ShieldCheck className="h-3 w-3 text-green-500" />
                                        tickets.yourbrand.com
                                    </div>
                                </div>
                                {/* Storefront content */}
                                <div className="p-5 space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-lg">Y</div>
                                        <div>
                                            <p className="font-bold text-sm">Your Brand Events</p>
                                            <p className="text-xs text-gray-400">4 upcoming events</p>
                                        </div>
                                    </div>
                                    {[
                                        { title: "Summer Night Party", price: "₱500", date: "Jun 14" },
                                        { title: "Rooftop Sessions Vol. 3", price: "₱350", date: "Jun 28" },
                                        { title: "Beach Rave 2026", price: "₱800", date: "Jul 5" },
                                    ].map((event) => (
                                        <div key={event.title} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                                    <Ticket className="h-4 w-4 text-primary" />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-semibold">{event.title}</p>
                                                    <p className="text-xs text-gray-400">{event.date}</p>
                                                </div>
                                            </div>
                                            <span className="text-xs font-bold text-primary">{event.price}</span>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </div>

                {/* 3. Customer Interaction */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                    <div className="order-2 lg:order-1 relative">
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
                            Don&apos;t just sell tickets — build a community. Direct messaging, announcements, and post-event feedback are built right in.
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
                                <span>Collect Feedback &amp; Reviews</span>
                            </li>
                            <li className="flex items-center gap-3 text-lg">
                                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                                    <QrCode className="h-5 w-5" />
                                </div>
                                <span>Free QR Check-in App</span>
                            </li>
                        </ul>
                    </div>
                </div>

                {/* 4. Built-in Marketing */}
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

                {/* 5. FAQ */}
                <div className="max-w-3xl mx-auto">
                    <div className="text-center mb-16 space-y-4">
                        <h2 className="text-4xl md:text-5xl font-headline font-bold">
                            Frequently Asked Questions
                        </h2>
                        <p className="text-xl text-muted-foreground font-light">
                            Everything you need to know before getting started.
                        </p>
                    </div>

                    <div className="space-y-3">
                        {faqs.map((faq, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 10 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.05 }}
                                className="rounded-2xl border border-border overflow-hidden"
                            >
                                <button
                                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                                    className="w-full flex items-center justify-between p-6 text-left hover:bg-muted/30 transition-colors"
                                >
                                    <span className="font-semibold text-base pr-4">{faq.q}</span>
                                    <ChevronDown
                                        className={`h-5 w-5 text-muted-foreground shrink-0 transition-transform duration-200 ${openFaq === i ? "rotate-180" : ""}`}
                                    />
                                </button>
                                <AnimatePresence initial={false}>
                                    {openFaq === i && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            <div className="px-6 pb-6 text-muted-foreground leading-relaxed border-t pt-4">
                                                {faq.a}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        ))}
                    </div>
                </div>

            </div>
        </section>
    );
}
