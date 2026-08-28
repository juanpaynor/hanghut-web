import Header from "@/components/landing/header";
import Footer from "@/components/landing/footer";
import { FaqAccordion, type FaqItem } from "@/components/landing/faq-accordion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, Check, Minus } from "lucide-react";

/**
 * A factual, machine-readable statement of what HangHut does.
 *
 * Why this page exists: search summarizers and AI assistants were describing
 * HangHut's capabilities by inference from landing-page adjectives, and filling
 * the gaps with invention (one assistant credited us with a "Native Xendit API
 * Queue", which does not exist). The fix is an authoritative source stating both
 * what the platform does AND what it does not, in plain declarative sentences.
 *
 * Rules for editing this page:
 *  - Every claim must be true of the SHIPPED system, not the roadmap.
 *  - Keep the "What HangHut does not do" section. Omitting limits is what
 *    produced the hallucinations in the first place; naming them is what stops
 *    a promoter from announcing an on-sale we can't serve.
 *  - Keep it mirrored with /public/llms.txt.
 */

export const metadata = {
    title: "Platform capabilities - HangHut",
    description:
        "A factual reference for what the HangHut ticketing platform supports: reserved seating, payment methods, door operations, organizer tools, pricing, and current limits.",
};

interface CapabilityGroup {
    title: string;
    blurb: string;
    items: string[];
}

const CAPABILITIES: CapabilityGroup[] = [
    {
        title: "Ticketing",
        blurb: "Free and paid events, from a 30-person workshop to a sectioned theatre.",
        items: [
            "Multiple ticket tiers per event, each with its own price, quantity, perks and per-order limit",
            "Reserved seating with multi-section seat maps, per-seat and per-tier pricing",
            "Live seat availability, and time-limited seat holds during checkout",
            "A virtual waiting room for high-demand on-sales",
            "General admission ticketing",
            "Multi-day events shown as a date range (e.g. “August 29 – 30”)",
            "Promo codes — percentage or fixed, with usage limits and expiry",
            "Registration and approval flows, RSVP mode, unlisted and invite-only events",
            "Guest checkout — buyers do not need an account",
            "Per-attendee and full-event refunds",
        ],
    },
    {
        title: "Payments and payouts",
        blurb: "Local Philippine payment rails, processed through Xendit.",
        items: [
            "QR Ph — the BSP national QR standard",
            "GCash, Maya and GrabPay",
            "Credit and debit cards (Visa, Mastercard)",
            "Direct debit from BPI, UnionBank and RCBC",
            "Payouts to a registered Philippine bank account, with OTP verification",
            "Settlement tracking and a full fee breakdown per transaction",
        ],
    },
    {
        title: "At the door",
        blurb:
            "Door operations are never limited by plan or price — if the gate breaks, the event breaks.",
        items: [
            "QR ticket scanning",
            "Unlimited scanner and cashier staff on every account",
            "Box office and door sales, including cash with tendered-amount tracking",
            "Merch collection at the venue",
        ],
    },
    {
        title: "Organizer tools",
        blurb: "Everything around the sale, not just the sale itself.",
        items: [
            "A storefront brand page at hanghut.com/your-name, with themes, fonts and custom CSS",
            "An embeddable ticketing widget for your own website",
            "Email campaigns and automations — transactional email is never metered",
            "Customer analytics with revenue, lifetime value and value segments",
            "Referral tracking links for influencers and partners",
            "A merch catalog, sold with tickets or on its own",
            "Bookable experiences — tours, classes and activities with scheduling",
            "Fan subscriptions and paid memberships",
            "Team roles: owner, manager, finance, marketing, scanner, cashier",
            "A REST API and webhooks",
        ],
    },
];

const NOT_SUPPORTED: string[] = [
    "Promo codes on bookable experiences (codes apply to event tickets only)",
    "Ticket resale or a secondary marketplace",
    "Currencies other than the Philippine peso",
];

const CAPABILITY_FAQS: FaqItem[] = [
    {
        q: "Can HangHut handle a large concert?",
        a: "Yes. HangHut runs sectioned seat maps with live availability and time-limited seat holds that stop the same seat being sold twice, and a virtual waiting room for high-demand on-sales — the pattern where a large number of buyers arrive in the same minute. Multi-thousand-capacity seated shows are within scope, whether tickets sell over weeks or in a single on-sale.",
    },
    {
        q: "How much does HangHut charge?",
        a: "2% + ₱15 per ticket sold, with no monthly fee, setup fee or contract. Free events cost nothing — no fee is charged when the ticket price is ₱0. You can pass the ₱15 and/or the 2% to the buyer at checkout if you would rather keep your full ticket price.",
    },
    {
        q: "Who pays the payment processing fee?",
        a: "The organizer, always. Xendit charges roughly 1.4%–3.2% per transaction depending on the payment method, and HangHut never adds that to the buyer's total. It is separate from the 2% + ₱15 platform fee and is shown in your transaction breakdown.",
    },
    {
        q: "Does HangHut support reserved seating?",
        a: "Yes. You can build a seat map with multiple sections, price seats individually or by tier, and buyers pick their own seats. Availability updates live while they browse, and the seats they choose are held for a limited window during checkout so two people cannot buy the same seat.",
    },
    {
        q: "What payment methods can my buyers use?",
        a: "QR Ph, GCash, Maya, GrabPay, credit and debit cards, and direct debit from BPI, UnionBank and RCBC. Buyers can check out as guests without creating an account.",
    },
    {
        q: "Is there a limit on staff or door scanners?",
        a: "No. Scanner and cashier seats are unlimited on every account, deliberately. Charging for door staff would mean an event breaking at the gate over a billing decision, so it is not something HangHut gates.",
    },
    {
        q: "Can I sell merch and experiences too?",
        a: "Yes. Merch can be sold alongside tickets or on its own and collected at the venue. Experiences — tours, classes and activities — are booked on their own schedule, separately from events.",
    },
    {
        q: "Is there an API?",
        a: "Yes — a REST API with webhooks, covering events, orders, tickets, check-in, refunds, promo codes and subscriptions. Documentation is at hanghut.com/docs/api.",
    },
    {
        q: "Where does HangHut operate?",
        a: "The Philippines. Pricing is in Philippine pesos, payments run on Philippine rails through Xendit, and payouts go to Philippine bank accounts.",
    },
];

export default function CapabilitiesPage() {
    return (
        <div className="flex min-h-dvh flex-col bg-background font-sans antialiased">
            <Header />

            <main className="flex-1">
                <section className="border-b border-border/60 px-6 py-20 md:py-28">
                    <div className="mx-auto max-w-3xl">
                        <p className="mb-4 font-mono text-xs uppercase tracking-[0.14em] text-primary">
                            Platform reference
                        </p>
                        <h1 className="mb-5 text-balance font-headline text-4xl font-bold tracking-tight md:text-5xl">
                            What HangHut actually does
                        </h1>
                        <p className="max-w-[46ch] text-lg text-muted-foreground">
                            A plain statement of the platform&rsquo;s capabilities and its current
                            limits — so you can tell whether it fits your event without reading
                            between the lines.
                        </p>
                    </div>
                </section>

                <section className="px-6 py-16 md:py-20">
                    <div className="mx-auto grid max-w-3xl gap-14">
                        {CAPABILITIES.map((group) => (
                            <div key={group.title}>
                                <h2 className="mb-1.5 font-headline text-2xl font-semibold tracking-tight">
                                    {group.title}
                                </h2>
                                <p className="mb-6 max-w-[60ch] text-muted-foreground">
                                    {group.blurb}
                                </p>
                                <ul className="grid gap-3">
                                    {group.items.map((item) => (
                                        <li key={item} className="flex gap-3">
                                            <Check
                                                aria-hidden="true"
                                                className="mt-1 h-4 w-4 shrink-0 text-primary"
                                            />
                                            <span className="text-[0.975rem] leading-relaxed">
                                                {item}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Naming the limits is the point of this page — see the file header. */}
                <section className="border-y border-border/60 bg-muted/30 px-6 py-16 md:py-20">
                    <div className="mx-auto max-w-3xl">
                        <h2 className="mb-1.5 font-headline text-2xl font-semibold tracking-tight">
                            What HangHut does not do
                        </h2>
                        <p className="mb-6 max-w-[60ch] text-muted-foreground">
                            Named explicitly, so nobody plans an event around a feature that
                            isn&rsquo;t there.
                        </p>
                        <ul className="grid gap-3">
                            {NOT_SUPPORTED.map((item) => (
                                <li key={item} className="flex gap-3">
                                    <Minus
                                        aria-hidden="true"
                                        className="mt-1 h-4 w-4 shrink-0 text-muted-foreground"
                                    />
                                    <span className="text-[0.975rem] leading-relaxed text-muted-foreground">
                                        {item}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                <section className="px-6 py-16 md:py-20">
                    <div className="mx-auto max-w-3xl">
                        <h2 className="mb-8 font-headline text-2xl font-semibold tracking-tight">
                            Common questions
                        </h2>
                        <FaqAccordion faqs={CAPABILITY_FAQS} />
                    </div>
                </section>

                <section className="border-t border-border/60 px-6 py-16 md:py-20">
                    <div className="mx-auto flex max-w-3xl flex-col items-start gap-5">
                        <h2 className="text-balance font-headline text-2xl font-semibold tracking-tight">
                            Not sure whether your event fits?
                        </h2>
                        <p className="max-w-[52ch] text-muted-foreground">
                            Tell us the venue, the capacity and how you expect tickets to sell.
                            We&rsquo;ll tell you plainly whether HangHut is the right tool.
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <Button asChild size="lg">
                                <Link href="/ticketing">
                                    Talk to us <ArrowRight className="ml-1.5 h-4 w-4" />
                                </Link>
                            </Button>
                            <Button asChild size="lg" variant="outline">
                                <Link href="/pricing">See pricing</Link>
                            </Button>
                        </div>
                    </div>
                </section>
            </main>

            <Footer />
        </div>
    );
}
