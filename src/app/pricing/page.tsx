import Header from "@/components/landing/header";
import Footer from "@/components/landing/footer";
import { PricingSection } from "@/components/landing/pricing-section";
import { FaqAccordion, type FaqItem } from "@/components/landing/faq-accordion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

export const metadata = {
    title: "Pricing - HangHut",
    description:
        "Just 2% + ₱15 per ticket. No monthly fees, no setup costs, no lock-in — and you can pass the fee to attendees to keep 100% of your ticket price.",
};

const PRICING_FAQS: FaqItem[] = [
    {
        q: "How much does HangHut charge per ticket?",
        a: "Just 2% + ₱15 per ticket sold, deducted from your payout. No setup fees, no monthly fees, no hidden charges. That covers everything — hosting, infrastructure, support, and your free storefront. And free events are always 100% free.",
    },
    {
        q: "Can I pass the fee on to my attendees?",
        a: "Yes. Flip one toggle on your Payouts page and the 2% + ₱15 is added to the attendee's total at checkout instead — so you keep 100% of your ticket price. You can switch back to absorbing it anytime.",
    },
    {
        q: "Who pays the payment processing fee?",
        a: "Xendit (our payment gateway) charges a processing fee of roughly 1.4%–3.2% per transaction depending on the method (QR Ph, e-wallets, cards). This is always absorbed by you and is separate from HangHut's platform fee — we never add it to your buyers' total.",
    },
    {
        q: "When do I get paid?",
        a: "Payouts are processed after your event. Funds are transferred to your registered bank account or e-wallet via Xendit. You'll receive a full breakdown of gross sales, platform fee, VAT, processing, and net payout in your organizer dashboard.",
    },
    {
        q: "Is there a contract or lock-in period?",
        a: "None. HangHut is pay-per-event — you only pay the 2% + ₱15 fee when you make a sale. You can stop using the platform at any time with no penalties.",
    },
    {
        q: "Can I sell free events?",
        a: "Yes. Free events have zero fees — we don't charge anything if the ticket price is ₱0. It's completely free to use HangHut for free events.",
    },
];

export default function PricingPage() {
    return (
        <div className="flex min-h-dvh flex-col bg-background font-sans antialiased">
            <Header />
            <main className="flex-1">
                {/* Hero */}
                <section className="relative w-full py-20 md:py-28 bg-gradient-to-b from-primary/5 to-background overflow-hidden">
                    <div className="absolute inset-0 opacity-10">
                        <div className="absolute top-20 left-10 w-72 h-72 bg-primary rounded-full blur-3xl animate-pulse" />
                        <div className="absolute bottom-10 right-20 w-96 h-96 bg-purple-500 rounded-full blur-3xl animate-pulse" />
                    </div>
                    <div className="container relative z-10 mx-auto px-4 text-center space-y-6">
                        <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-green-100 text-green-700 font-bold text-sm uppercase tracking-wider border-2 border-green-200 shadow-lg">
                            <Sparkles className="h-4 w-4" />
                            No Monthly Fees. No Lock-in.
                        </div>
                        <h1 className="text-5xl md:text-7xl font-headline font-bold tracking-tighter">
                            Simple, honest pricing
                        </h1>
                        <p className="text-xl md:text-2xl text-muted-foreground font-light max-w-3xl mx-auto leading-relaxed">
                            <span className="font-bold text-foreground">Just 2% + ₱15</span> per ticket — and you can pass
                            it to attendees to keep <span className="text-primary font-bold">100%</span> of your ticket price.
                        </p>
                    </div>
                </section>

                {/* Shared pricing block (fee card + calculator + trust + comparison) */}
                <PricingSection />

                {/* FAQ */}
                <section className="py-20 bg-background">
                    <div className="container px-4 mx-auto max-w-3xl">
                        <div className="text-center mb-12 space-y-3">
                            <h2 className="text-3xl md:text-4xl font-headline font-bold">Pricing questions</h2>
                            <p className="text-lg text-muted-foreground font-light">Everything about fees, payouts, and getting paid.</p>
                        </div>
                        <FaqAccordion faqs={PRICING_FAQS} />
                    </div>
                </section>

                {/* CTA */}
                <section className="relative w-full py-20 bg-primary text-primary-foreground overflow-hidden">
                    <div className="absolute inset-0 opacity-10">
                        <div className="absolute top-10 left-10 w-64 h-64 bg-white rounded-full blur-3xl animate-pulse" />
                        <div className="absolute bottom-10 right-10 w-96 h-96 bg-white rounded-full blur-3xl animate-pulse" />
                    </div>
                    <div className="container relative z-10 mx-auto px-4 text-center space-y-6">
                        <h2 className="text-4xl md:text-5xl font-headline font-bold tracking-tight">Start selling today</h2>
                        <p className="text-xl opacity-90 max-w-2xl mx-auto">
                            No card required. Create your event and go live in minutes.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                            <Link href="/organizer/register">
                                <Button
                                    size="lg"
                                    className="bg-white text-primary hover:bg-white/90 rounded-full px-12 py-8 text-xl font-bold shadow-2xl transition-all hover:scale-105"
                                >
                                    Create Your First Event
                                    <ArrowRight className="ml-3 h-6 w-6" />
                                </Button>
                            </Link>
                            <Link href="/ticketing">
                                <Button
                                    size="lg"
                                    variant="outline"
                                    className="bg-transparent border-2 border-white text-white hover:bg-white hover:text-primary rounded-full px-12 py-8 text-xl font-bold transition-all"
                                >
                                    See all features
                                </Button>
                            </Link>
                        </div>
                    </div>
                </section>
            </main>
            <Footer />
        </div>
    );
}
