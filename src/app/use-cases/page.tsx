import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/landing/header'
import Footer from '@/components/landing/footer'
import { USE_CASES, ACCENT } from '@/lib/marketing/use-cases'
import {
    ArrowRight, Armchair, UserCheck, Code2, Palette, Mail, ScanLine, Check,
} from 'lucide-react'

const PLATFORM = [
    { icon: Armchair, title: 'Interactive seat maps', body: 'Reserved seating with per-tier pricing your buyers pick visually.', accent: 'violet' as const },
    { icon: UserCheck, title: 'Free-event RSVP', body: 'One-tap sign-ups and headcounts for no-cost events — no checkout.', accent: 'emerald' as const },
    { icon: Code2, title: 'Embeddable widget', body: 'Sell tickets right on your own website with a copy-paste snippet.', accent: 'indigo' as const },
    { icon: Palette, title: 'Custom ticket design', body: 'Your logo, colors, and message on the ticket attendees actually see.', accent: 'rose' as const },
    { icon: Mail, title: 'Email marketing', body: 'Reminders, announcements, and lifecycle emails to grow every event.', accent: 'orange' as const },
    { icon: ScanLine, title: 'QR check-in', body: 'Seconds-fast, duplicate-proof entry with the seat shown at the door.', accent: 'sky' as const },
]

const BENEFITS = ['No monthly fees', 'GCash · cards · QRPh', 'Payouts to your bank', 'Built for the Philippines 🇵🇭']

export const metadata: Metadata = {
    title: 'Use Cases — HangHut for every kind of event',
    description: 'See how live-music promoters, gyms, markets, workshops, conferences, and communities use HangHut to sell tickets, take RSVPs, and run a smooth door.',
}

export default function UseCasesHubPage() {
    return (
        <div className="flex min-h-dvh flex-col font-sans antialiased" style={{ backgroundColor: '#FAFAF8' }}>
            <Header />
            <main className="flex-1">
                {/* ── Hero ───────────────────────────────── */}
                <section className="relative overflow-hidden">
                    <div aria-hidden className="pointer-events-none absolute inset-0 -z-0">
                        <div className="absolute left-1/4 top-0 h-80 w-80 -translate-x-1/2 rounded-full bg-indigo-300/50 blur-[110px]" />
                        <div className="absolute right-1/4 top-10 h-80 w-80 translate-x-1/2 rounded-full bg-orange-300/50 blur-[110px]" />
                        <div className="absolute left-1/2 top-24 h-80 w-80 -translate-x-1/2 rounded-full bg-emerald-300/40 blur-[120px]" />
                    </div>
                    <div className="relative mx-auto max-w-4xl px-4 pt-16 pb-12 text-center md:pt-24">
                        <span className="inline-block rounded-full bg-white px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-indigo-600 shadow-sm ring-1 ring-black/5">
                            Use cases
                        </span>
                        <h1 className="mx-auto mt-5 max-w-3xl font-headline text-5xl font-extrabold leading-[1.05] tracking-tight text-gray-900 md:text-7xl">
                            One platform for <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent">every</span> kind of event
                        </h1>
                        <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600 md:text-xl">
                            A concert, a class, a market, or a meetup — HangHut handles discovery, tickets,
                            RSVPs, and check-in in one place.
                        </p>
                        <div className="mt-8 flex flex-wrap justify-center gap-3">
                            <Link href="/ticketing" className="rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-7 py-3.5 text-sm font-bold text-white shadow-lg transition-transform hover:scale-105">
                                Become a partner
                            </Link>
                            <Link href="/download" className="rounded-full border-2 border-gray-900 px-7 py-3.5 text-sm font-bold text-gray-900 transition-colors hover:bg-gray-900 hover:text-white">
                                Download the app
                            </Link>
                        </div>
                        <div className="mx-auto mt-10 flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-2">
                            {BENEFITS.map((b) => (
                                <span key={b} className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600">
                                    <Check className="h-4 w-4 text-emerald-500" strokeWidth={3} /> {b}
                                </span>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Vertical grid ──────────────────────── */}
                <section className="px-4 pb-16">
                    <div className="mx-auto grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {USE_CASES.map((uc) => {
                            const a = ACCENT[uc.accent]
                            return (
                                <Link
                                    key={uc.slug}
                                    href={`/use-cases/${uc.slug}`}
                                    className="group relative flex flex-col overflow-hidden rounded-[1.75rem] border-2 border-black/5 bg-white p-7 shadow-sm transition-transform hover:-translate-y-1.5 hover:rotate-1"
                                >
                                    <span className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${a.grad}`} />
                                    <span className={`flex h-16 w-16 rotate-[-4deg] items-center justify-center rounded-2xl ${a.bg} text-3xl shadow-sm transition-transform group-hover:rotate-0`}>
                                        {uc.emoji}
                                    </span>
                                    <h2 className="mt-5 font-headline text-xl font-bold text-gray-900">{uc.name}</h2>
                                    <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-600">{uc.subhead}</p>
                                    <span className={`mt-5 inline-flex items-center gap-1 text-sm font-bold ${a.text}`}>
                                        Learn more
                                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                                    </span>
                                </Link>
                            )
                        })}
                    </div>
                </section>

                {/* ── One platform, every tool ───────────── */}
                <section className="border-y-2 border-black/5 bg-white px-4 py-20">
                    <div className="mx-auto max-w-5xl">
                        <div className="text-center">
                            <h2 className="font-headline text-4xl font-extrabold tracking-tight text-gray-900">One platform, every tool</h2>
                            <p className="mx-auto mt-3 max-w-2xl text-gray-600">
                                The same powerful toolkit powers every use case — no add-ons, no extra apps.
                            </p>
                        </div>
                        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                            {PLATFORM.map((p) => {
                                const PIcon = p.icon
                                const a = ACCENT[p.accent]
                                return (
                                    <div key={p.title} className="rounded-[1.5rem] border-2 border-black/5 bg-[#FAFAF8] p-7 transition-transform hover:-translate-y-1">
                                        <span className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${a.grad} text-white shadow-md`}>
                                            <PIcon className="h-6 w-6" />
                                        </span>
                                        <h3 className="mt-5 font-headline text-lg font-bold text-gray-900">{p.title}</h3>
                                        <p className="mt-2 text-sm leading-relaxed text-gray-600">{p.body}</p>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </section>

                {/* ── Closing CTA ────────────────────────── */}
                <section className="px-4 py-20">
                    <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-8 py-16 text-center text-white shadow-2xl">
                        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/15 blur-2xl" />
                        <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-black/10 blur-2xl" />
                        <div className="relative">
                            <h2 className="font-headline text-3xl font-extrabold md:text-4xl">Ready to host your next one?</h2>
                            <p className="mx-auto mt-3 max-w-xl text-indigo-100">
                                Set up your event in minutes. No monthly fees — you only pay when you sell.
                            </p>
                            <div className="mt-8 flex flex-wrap justify-center gap-3">
                                <Link href="/ticketing" className="rounded-full bg-white px-7 py-3.5 text-sm font-bold text-indigo-700 shadow-lg transition-transform hover:scale-105">
                                    Become a partner
                                </Link>
                                <Link href="/organizer/login" className="rounded-full border-2 border-white/50 px-7 py-3.5 text-sm font-bold text-white transition-colors hover:bg-white/10">
                                    Partner login
                                </Link>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
            <Footer />
        </div>
    )
}
