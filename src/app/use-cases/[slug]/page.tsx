import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Header from '@/components/landing/header'
import Footer from '@/components/landing/footer'
import { USE_CASES, ACCENT, getUseCase } from '@/lib/marketing/use-cases'
import {
    ArrowRight, ArrowLeft, Check, Sparkles, ChevronDown,
    Armchair, Layers, QrCode, UserCheck, Code2, Mail, MapPin, ClipboardList,
    CreditCard, BarChart3, Palette, Ticket, Rocket, Share2, ScanLine,
} from 'lucide-react'

// Map a feature chip to a fitting icon (best-effort keyword match).
function featureIcon(feature: string): React.ElementType {
    const f = feature.toLowerCase()
    if (f.includes('seat')) return Armchair
    if (f.includes('tier') || f.includes('pass')) return Layers
    if (f.includes('qr') || f.includes('check-in')) return QrCode
    if (f.includes('rsvp') || f.includes('join')) return UserCheck
    if (f.includes('embed')) return Code2
    if (f.includes('email')) return Mail
    if (f.includes('map') || f.includes('discover')) return MapPin
    if (f.includes('question')) return ClipboardList
    if (f.includes('gcash') || f.includes('card') || f.includes('qrph')) return CreditCard
    if (f.includes('insight') || f.includes('attendee')) return BarChart3
    if (f.includes('design')) return Palette
    if (f.includes('capacity') || f.includes('categor')) return Ticket
    return Check
}

const BENEFITS = ['No monthly fees', 'Payouts to your bank', 'GCash · cards · QRPh', 'Set up in minutes']

const HOW_IT_WORKS = [
    { icon: Rocket, title: 'Create your event', body: 'Add the details, set ticket tiers or switch on free RSVP, and publish in minutes.' },
    { icon: Share2, title: 'Share everywhere', body: 'Post your link, embed it on your own site, and get discovered on the HangHut map.' },
    { icon: ScanLine, title: 'Check them in', body: 'Scan QR codes at the door — fast, duplicate-proof entry with the seat shown instantly.' },
]

const GENERIC_FAQS = [
    { q: 'How much does HangHut cost?', a: 'There are no monthly fees. You only pay a small per-ticket fee when you sell — free events cost nothing.' },
    { q: 'How do I get paid?', a: 'Payouts go straight to your bank account after your event, handled securely through our licensed payment partner.' },
    { q: 'Can attendees pay with GCash?', a: 'Yes. GCash, credit/debit cards, and QRPh are all supported at checkout — no app required to buy.' },
    { q: 'Do buyers need to download the app?', a: 'No. Anyone can buy on the web as a guest. The app just makes discovering events and managing tickets easier.' },
]

export function generateStaticParams() {
    return USE_CASES.map((u) => ({ slug: u.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const { slug } = await params
    const uc = getUseCase(slug)
    if (!uc) return { title: 'Use Cases — HangHut' }
    return { title: `${uc.name} — HangHut`, description: uc.subhead }
}

export default async function UseCasePage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    const uc = getUseCase(slug)
    if (!uc) notFound()

    const a = ACCENT[uc.accent]
    const faqs = [...(uc.faqs ?? []), ...GENERIC_FAQS]

    return (
        <div className="flex min-h-dvh flex-col font-sans antialiased" style={{ backgroundColor: '#FAFAF8' }}>
            <Header />
            <main className="flex-1">
                {/* ── Hero ───────────────────────────────── */}
                <section className={`relative overflow-hidden bg-gradient-to-b ${a.soft} via-[#FAFAF8] to-[#FAFAF8]`}>
                    <div aria-hidden className={`pointer-events-none absolute -right-20 -top-24 h-96 w-96 rounded-full ${a.glow} opacity-30 blur-[120px]`} />
                    <div aria-hidden className={`pointer-events-none absolute -left-24 top-40 h-80 w-80 rounded-full ${a.glow} opacity-20 blur-[130px]`} />

                    <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-10 text-center md:pt-14">
                        <Link href="/use-cases" className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 transition-colors hover:text-gray-900">
                            <ArrowLeft className="h-4 w-4" /> All use cases
                        </Link>

                        {/* Big emoji tile */}
                        <div className="mt-8 flex justify-center">
                            <span className={`flex h-24 w-24 rotate-[-4deg] items-center justify-center rounded-[1.75rem] bg-white text-5xl shadow-xl ring-1 ${a.ring} transition-transform hover:rotate-0`}>
                                {uc.emoji}
                            </span>
                        </div>

                        <span className={`mt-6 inline-block rounded-full bg-white px-4 py-1.5 text-xs font-bold uppercase tracking-widest ${a.text} shadow-sm ring-1 ${a.ring}`}>
                            {uc.eyebrow}
                        </span>

                        <h1 className="mx-auto mt-5 max-w-3xl font-headline text-5xl font-extrabold leading-[1.05] tracking-tight text-gray-900 md:text-7xl">
                            {uc.headline}
                        </h1>
                        <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600 md:text-xl">{uc.subhead}</p>

                        <div className="mt-8 flex flex-wrap justify-center gap-3">
                            <Link href="/ticketing" className={`rounded-full bg-gradient-to-r ${a.grad} px-7 py-3.5 text-sm font-bold text-white shadow-lg transition-transform hover:scale-105`}>
                                Become a partner
                            </Link>
                            <Link href="/download" className="rounded-full border-2 border-gray-900 bg-transparent px-7 py-3.5 text-sm font-bold text-gray-900 transition-colors hover:bg-gray-900 hover:text-white">
                                Download the app
                            </Link>
                        </div>

                        {/* Feature pills — gradient */}
                        <div className="mt-9 flex flex-wrap justify-center gap-2.5">
                            {uc.features.map((f) => (
                                <span key={f} className={`rounded-full bg-gradient-to-r ${a.grad} px-4 py-2 text-sm font-bold text-white shadow-sm`}>
                                    {f}
                                </span>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Trust strip ────────────────────────── */}
                <section className="border-y-2 border-black/5 bg-white">
                    <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 px-4 py-6 sm:grid-cols-4">
                        {BENEFITS.map((b) => (
                            <div key={b} className="flex items-center gap-2 text-sm font-bold text-gray-800">
                                <span className={`flex h-6 w-6 items-center justify-center rounded-full ${a.bg} ${a.text}`}>
                                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                                </span>
                                {b}
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── Challenge ──────────────────────────── */}
                <section className="px-4 py-16 md:py-20">
                    <div className="mx-auto max-w-5xl">
                        <p className={`text-center text-sm font-bold uppercase tracking-widest ${a.text}`}>The challenge</p>
                        <h2 className="mx-auto mt-3 max-w-2xl text-center font-headline text-3xl font-extrabold text-gray-900 md:text-4xl">
                            Running {uc.name.toLowerCase()} events shouldn’t be this hard
                        </h2>
                        <div className="mt-10 grid gap-5 sm:grid-cols-3">
                            {uc.challenges.map((c) => (
                                <div key={c.title} className={`rounded-[1.5rem] border-2 ${a.border} ${a.bg} p-6 transition-transform hover:-translate-y-1`}>
                                    <h3 className="font-headline text-lg font-bold text-gray-900">{c.title}</h3>
                                    <p className="mt-2 text-sm leading-relaxed text-gray-600">{c.body}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Solutions ──────────────────────────── */}
                <section className="bg-white px-4 py-16 md:py-20">
                    <div className="mx-auto max-w-5xl">
                        <p className={`text-center text-sm font-bold uppercase tracking-widest ${a.text}`}>How HangHut helps</p>
                        <h2 className="mt-3 text-center font-headline text-3xl font-extrabold text-gray-900 md:text-4xl">
                            The tools that do the heavy lifting
                        </h2>
                        <div className="mt-10 grid gap-5 md:grid-cols-3">
                            {uc.solutions.map((s, i) => (
                                <div key={s.title} className="rounded-[1.5rem] border-2 border-black/5 bg-[#FAFAF8] p-7 transition-transform hover:-translate-y-1.5 hover:rotate-1">
                                    <span className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${a.grad} font-headline text-xl font-extrabold text-white shadow-md`}>
                                        {String(i + 1).padStart(2, '0')}
                                    </span>
                                    <h3 className="mt-5 font-headline text-lg font-bold text-gray-900">{s.title}</h3>
                                    <p className="mt-2 text-sm leading-relaxed text-gray-600">{s.body}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Everything you need ────────────────── */}
                <section className="px-4 py-16 md:py-20">
                    <div className="mx-auto max-w-5xl">
                        <h2 className="text-center font-headline text-3xl font-extrabold text-gray-900 md:text-4xl">Everything you need, built in</h2>
                        <div className="mt-10 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                            {uc.features.map((f) => {
                                const FIcon = featureIcon(f)
                                return (
                                    <div key={f} className="flex items-center gap-4 rounded-2xl border-2 border-black/5 bg-white p-5 transition-transform hover:-translate-y-1">
                                        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${a.bg} ${a.text}`}>
                                            <FIcon className="h-6 w-6" />
                                        </span>
                                        <p className="font-bold text-gray-900">{f}</p>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </section>

                {/* ── How it works ───────────────────────── */}
                <section className="bg-white px-4 py-16 md:py-20">
                    <div className="mx-auto max-w-5xl">
                        <h2 className="text-center font-headline text-3xl font-extrabold text-gray-900 md:text-4xl">Up and running in 3 steps</h2>
                        <div className="mt-12 grid gap-10 md:grid-cols-3">
                            {HOW_IT_WORKS.map((step, i) => {
                                const SIcon = step.icon
                                return (
                                    <div key={step.title} className="relative text-center">
                                        <span className={`mx-auto flex h-20 w-20 items-center justify-center rounded-[1.5rem] bg-gradient-to-br ${a.grad} text-white shadow-xl`}>
                                            <SIcon className="h-9 w-9" />
                                        </span>
                                        <h3 className="mt-5 font-headline text-xl font-bold text-gray-900">
                                            <span className={a.text}>{i + 1}.</span> {step.title}
                                        </h3>
                                        <p className="mt-2 text-sm leading-relaxed text-gray-600">{step.body}</p>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </section>

                {/* ── Case study (optional) ──────────────── */}
                {uc.caseStudy && (
                    <section className="px-4 py-16">
                        <div className={`mx-auto max-w-3xl rounded-[2rem] border-2 ${a.border} ${a.bg} p-9`}>
                            <Sparkles className={`h-7 w-7 ${a.text}`} />
                            <blockquote className="mt-4 font-headline text-2xl font-bold leading-relaxed text-gray-900">“{uc.caseStudy.quote}”</blockquote>
                            <div className="mt-4 text-sm text-gray-600">
                                <span className="font-bold text-gray-900">{uc.caseStudy.author}</span> · {uc.caseStudy.role}
                            </div>
                            {uc.caseStudy.metrics && (
                                <div className="mt-6 grid grid-cols-3 gap-4 border-t-2 border-black/10 pt-6">
                                    {uc.caseStudy.metrics.map((m) => (
                                        <div key={m.label}>
                                            <div className={`font-headline text-3xl font-extrabold ${a.text}`}>{m.value}</div>
                                            <div className="text-xs font-medium text-gray-500">{m.label}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>
                )}

                {/* ── FAQ ────────────────────────────────── */}
                <section className="px-4 py-16 md:py-20">
                    <div className="mx-auto max-w-2xl">
                        <h2 className="text-center font-headline text-3xl font-extrabold text-gray-900 md:text-4xl">Frequently asked</h2>
                        <div className="mt-8 space-y-3">
                            {faqs.map((f) => (
                                <details key={f.q} className="group rounded-2xl border-2 border-black/5 bg-white px-6 py-4 transition-colors open:border-black/10">
                                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-headline font-bold text-gray-900">
                                        {f.q}
                                        <ChevronDown className={`h-5 w-5 shrink-0 ${a.text} transition-transform group-open:rotate-180`} />
                                    </summary>
                                    <p className="mt-3 text-sm leading-relaxed text-gray-600">{f.a}</p>
                                </details>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── CTA ────────────────────────────────── */}
                <section className="px-4 pb-16">
                    <div className={`relative mx-auto max-w-5xl overflow-hidden rounded-[2.5rem] bg-gradient-to-br ${a.grad} px-8 py-16 text-center text-white shadow-2xl`}>
                        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/15 blur-2xl" />
                        <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-black/10 blur-2xl" />
                        <div className="relative">
                            <div className="text-5xl">{uc.emoji}</div>
                            <h2 className="mt-4 font-headline text-3xl font-extrabold md:text-4xl">Start selling for your {uc.name.toLowerCase()} event</h2>
                            <p className="mx-auto mt-3 max-w-xl text-white/90">No monthly fees — you only pay when you sell. Set up in minutes.</p>
                            <div className="mt-8 flex flex-wrap justify-center gap-3">
                                <Link href="/ticketing" className="rounded-full bg-white px-7 py-3.5 text-sm font-bold text-gray-900 shadow-lg transition-transform hover:scale-105">
                                    Become a partner
                                </Link>
                                <Link href="/organizer/login" className="rounded-full border-2 border-white/50 px-7 py-3.5 text-sm font-bold text-white transition-colors hover:bg-white/10">
                                    Partner login
                                </Link>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Other use cases ────────────────────── */}
                <section className="px-4 pb-24">
                    <div className="mx-auto max-w-4xl">
                        <h2 className="text-center text-sm font-bold uppercase tracking-widest text-gray-400">Explore more use cases</h2>
                        <div className="mt-5 flex flex-wrap justify-center gap-3">
                            {USE_CASES.filter((u) => u.slug !== uc.slug).map((u) => (
                                <Link
                                    key={u.slug}
                                    href={`/use-cases/${u.slug}`}
                                    className="inline-flex items-center gap-2 rounded-full border-2 border-black/10 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition-transform hover:-translate-y-0.5"
                                >
                                    <span>{u.emoji}</span>
                                    {u.name}
                                </Link>
                            ))}
                        </div>
                    </div>
                </section>
            </main>
            <Footer />
        </div>
    )
}
