import Header from "@/components/landing/header";
import Footer from "@/components/landing/footer";
import HowItWorks from "@/components/landing/how-it-works";
import { TicketingFeatures } from "@/components/landing/ticketing-features";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

export const metadata = {
    title: "Become a Partner - HangHut",
    description: "Sell tickets, grow your audience, and get paid instantly. HangHut promotes your events to thousands of users for free — zero monthly fees.",
};

export default function TicketingPage() {
    return (
        <div className="flex min-h-dvh flex-col bg-background font-sans antialiased">
            <Header />
            <main className="flex-1">
                {/* Page Header */}
                <section className="relative w-full py-20 md:py-32 bg-gradient-to-b from-primary/5 to-background overflow-hidden">
                    {/* Background decoration */}
                    <div className="absolute inset-0 opacity-10">
                        <div className="absolute top-20 left-10 w-72 h-72 bg-primary rounded-full blur-3xl animate-pulse" />
                        <div className="absolute bottom-10 right-20 w-96 h-96 bg-purple-500 rounded-full blur-3xl animate-pulse" />
                    </div>

                    <div className="container relative z-10 mx-auto px-4 text-center space-y-8">
                        {/* Badge */}
                        <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-green-100 text-green-700 font-bold text-sm uppercase tracking-wider border-2 border-green-200 shadow-lg">
                            <Sparkles className="h-4 w-4" />
                            No Monthly Fees. No Lock-in.
                        </div>

                        <h1 className="text-5xl md:text-7xl lg:text-8xl font-headline font-bold tracking-tighter">
                            Become a Partner
                        </h1>

                        <p className="text-xl md:text-2xl text-muted-foreground font-light max-w-3xl mx-auto leading-relaxed">
                            Sell tickets, fill your venue, and grow your audience — with a platform that
                            <span className="font-bold text-foreground"> actively promotes your events</span> to thousands of real people
                            <span className="text-primary font-bold"> for free</span>.
                        </p>

                        {/* Key Benefits */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto pt-8">
                            <div className="p-6 rounded-2xl bg-white/50 backdrop-blur-sm border border-border/50 hover:shadow-lg transition-shadow">
                                <div className="text-4xl mb-3">📱</div>
                                <h3 className="font-bold text-lg mb-2">Built-in Audience</h3>
                                <p className="text-sm text-muted-foreground">Your events land on our social app feed and map the moment you go live</p>
                            </div>
                            <div className="p-6 rounded-2xl bg-white/50 backdrop-blur-sm border border-border/50 hover:shadow-lg transition-shadow">
                                <div className="text-4xl mb-3">🎯</div>
                                <h3 className="font-bold text-lg mb-2">Just 2% + ₱15 Per Ticket</h3>
                                <p className="text-sm text-muted-foreground">Or pass it to attendees and keep 100%. Zero monthly fees, zero setup, zero risk</p>
                            </div>
                            <div className="p-6 rounded-2xl bg-white/50 backdrop-blur-sm border border-border/50 hover:shadow-lg transition-shadow">
                                <div className="text-4xl mb-3">⚡</div>
                                <h3 className="font-bold text-lg mb-2">Up and Running Today</h3>
                                <p className="text-sm text-muted-foreground">Create your event, set your price, and start selling in under 10 minutes</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Main Content */}
                <HowItWorks />
                <TicketingFeatures />


                {/* Bottom CTA */}
                <section className="relative w-full py-20 bg-primary text-primary-foreground overflow-hidden">
                    {/* Background decoration */}
                    <div className="absolute inset-0 opacity-10">
                        <div className="absolute top-0 left-0 w-full h-full">
                            <div className="absolute top-10 left-10 w-64 h-64 bg-white rounded-full blur-3xl animate-pulse" />
                            <div className="absolute bottom-10 right-10 w-96 h-96 bg-white rounded-full blur-3xl animate-pulse" />
                        </div>
                    </div>

                    <div className="container relative z-10 mx-auto px-4 text-center space-y-8">
                        <div className="inline-block px-6 py-2 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 text-sm font-bold uppercase tracking-wider mb-4">
                            ✨ Your Audience Is Already Here
                        </div>

                        <h2 className="text-4xl md:text-6xl font-headline font-bold tracking-tight">
                            Ready to Partner Up?
                        </h2>
                        <p className="text-xl md:text-2xl opacity-90 max-w-2xl mx-auto">
                            Join the growing community of event organizers, venues, and brands reaching thousands of people — without spending a peso on ads.
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
                            <Link href="/organizer/login">
                                <Button
                                    size="lg"
                                    variant="outline"
                                    className="bg-transparent border-2 border-white text-white hover:bg-white hover:text-primary rounded-full px-12 py-8 text-xl font-bold transition-all"
                                >
                                    Sign In
                                </Button>
                            </Link>
                        </div>
                        <p className="text-sm opacity-80 pt-2">Free to start · No card required · Live in minutes</p>
                    </div>
                </section>
            </main>
            <Footer />
        </div>
    );
}
