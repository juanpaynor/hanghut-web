import Image from "next/image";
import Link from "next/link";
import { Instagram, Mail, MapPin } from "lucide-react";
import { StoreButtons } from "@/components/landing/store-buttons";

/* The landing's footer. Same links, addresses and legal surface as the shared
   footer — that file stays light because /events, /pricing and the use-case
   pages still use it. */

const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
    {
        title: "Product",
        links: [
            { label: "Ticketing", href: "/ticketing" },
            { label: "Pricing", href: "/pricing" },
            { label: "Experiences", href: "/experiences" },
            { label: "Discover Events", href: "/events" },
            { label: "Download App", href: "/download" },
        ],
    },
    {
        title: "Use Cases",
        links: [
            { label: "Live Music & Concerts", href: "/use-cases/live-music" },
            { label: "Sports & Fitness", href: "/use-cases/sports-fitness" },
            { label: "Markets & Pop-ups", href: "/use-cases/markets-popups" },
            { label: "All use cases", href: "/use-cases" },
        ],
    },
    {
        title: "Company",
        links: [
            { label: "Become a Partner", href: "/ticketing" },
            { label: "Partner Login", href: "/organizer/login" },
            { label: "Contact", href: "mailto:contact@hanghut.com", external: true },
            { label: "Developers", href: "/docs/api" },
        ],
    },
    {
        title: "Legal",
        links: [
            { label: "Terms of Service", href: "/terms-of-service" },
            { label: "Privacy Policy", href: "/privacy-policy" },
            { label: "Child Safety", href: "/child-safety" },
            { label: "Copyright", href: "/copyright" },
        ],
    },
];

export default function LandingFooter() {
    return (
        <footer className="relative overflow-hidden border-t border-[var(--lp-line)] bg-[var(--lp-deep)]">
            <div
                aria-hidden
                className="pointer-events-none absolute -bottom-40 left-1/2 h-80 w-[720px] -translate-x-1/2 rounded-full bg-[var(--lp-brand)]/8 blur-[140px]"
            />

            <div className="relative mx-auto max-w-7xl px-6 py-16 md:px-12 md:py-20">
                <div className="grid grid-cols-2 gap-10 md:grid-cols-3 lg:grid-cols-6">
                    <div className="col-span-2 space-y-5">
                        <Image
                            src="/logo_transparent.png"
                            alt="HangHut"
                            width={120}
                            height={40}
                            className="h-9 w-auto"
                        />
                        <p className="max-w-xs text-sm leading-relaxed text-[var(--lp-muted)]">
                            Discover activities, sell tickets, and gather your crew — all in one place.
                        </p>
                        <div className="flex items-start gap-2 text-sm text-[var(--lp-muted)]">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--lp-dim)]" />
                            <span>Level 40, PBCom Tower, Ayala Ave, Makati City, 1226 Metro Manila</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-[var(--lp-muted)]">
                            <Mail className="h-4 w-4 shrink-0 text-[var(--lp-dim)]" />
                            <a
                                href="mailto:contact@hanghut.com"
                                className="transition-colors hover:text-[var(--lp-text)]"
                            >
                                contact@hanghut.com
                            </a>
                        </div>
                        <div className="flex items-center gap-3 pt-1">
                            <a
                                href="https://www.instagram.com/hanghut.app/"
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Instagram"
                                className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--lp-line-strong)] text-[var(--lp-muted)] transition-colors hover:border-[var(--lp-brand-soft)] hover:text-[var(--lp-text)]"
                            >
                                <Instagram className="h-4 w-4" />
                            </a>
                        </div>
                    </div>

                    {COLUMNS.map((col) => (
                        <div key={col.title} className="space-y-4">
                            <h3 className="lp-mono text-[11px] uppercase tracking-[0.24em] text-[var(--lp-dim)]">
                                {col.title}
                            </h3>
                            <ul className="space-y-2.5">
                                {col.links.map((link) => (
                                    <li key={link.label}>
                                        {link.external ? (
                                            <a
                                                href={link.href}
                                                className="text-sm text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-text)]"
                                            >
                                                {link.label}
                                            </a>
                                        ) : (
                                            <Link
                                                href={link.href}
                                                className="text-sm text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-text)]"
                                            >
                                                {link.label}
                                            </Link>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                <div className="mt-14 border-t border-[var(--lp-line)] pt-10">
                    <p className="mb-4 text-sm font-medium text-[var(--lp-text)]">Get the app</p>
                    <StoreButtons variant="dark" className="!items-start !justify-start" />
                </div>

                <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-[var(--lp-line)] pt-8 md:flex-row">
                    <p className="text-sm text-[var(--lp-dim)]">
                        © {new Date().getFullYear()} HangHut. All rights reserved.
                    </p>
                    <p className="text-xs text-[var(--lp-dim)]">Made in the Philippines 🇵🇭</p>
                </div>
            </div>
        </footer>
    );
}
