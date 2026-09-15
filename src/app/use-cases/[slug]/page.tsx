import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { USE_CASES, getUseCase } from '@/lib/marketing/use-cases'
import { MaskedLines, Reveal, SceneLabel, Magnetic } from '@/components/landing/scenes/primitives'
import CTA from '@/components/landing/scenes/cta'
import {
    ArrowRight, ArrowUpRight, Check, ChevronDown,
    Armchair, Layers, QrCode, UserCheck, Code2, Mail, MapPin, ClipboardList,
    CreditCard, BarChart3, Palette, Ticket, CalendarPlus, Share2, ScanLine,
    type LucideIcon,
} from 'lucide-react'

// Map a feature chip to a fitting icon (best-effort keyword match).
function featureIcon(feature: string): LucideIcon {
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

// Split a short headline into two display lines at the word midpoint, so the
// masked-line reveal has something to reveal line by line.
function twoLines(text: string): string[] {
    const words = text.split(' ')
    if (words.length < 3) return [text]
    const cut = Math.ceil(words.length / 2)
    return [words.slice(0, cut).join(' '), words.slice(cut).join(' ')]
}

const STEPS = [
    { icon: CalendarPlus, n: '01', title: 'Create the event', body: 'Add the details, set ticket tiers or switch on free RSVP, publish.' },
    { icon: Share2, n: '02', title: 'Share everywhere', body: 'Your link, an embed on your own site, and the HangHut map.' },
    { icon: ScanLine, n: '03', title: 'Check them in', body: 'Scan QR at the door — duplicate-proof, seat shown instantly.' },
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

/**
 * One use case, told the way the landing tells everything: a numbered
 * sequence on hairline grids, one brand colour, big display type. The
 * per-vertical rainbow accents and gradient pills of the old page are gone —
 * six colour schemes for six pages made them read as six different products.
 */
export default async function UseCasePage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    const uc = getUseCase(slug)
    if (!uc) notFound()

    const faqs = [...(uc.faqs ?? []), ...GENERIC_FAQS]
    const index = USE_CASES.findIndex((u) => u.slug === uc.slug)
    const others = USE_CASES.filter((u) => u.slug !== uc.slug)
    // Challenges and solutions are authored as parallel triples: the i-th
    // solution answers the i-th challenge. Present them as pairs, not two lists.
    const pairs = uc.challenges.map((c, i) => ({ challenge: c, solution: uc.solutions[i] }))

    return (
        <>
            {/* ── Hero ─────────────────────────────────────────────────── */}
            <section className="relative overflow-hidden pt-20">
                <div
                    aria-hidden
                    className="pointer-events-none absolute -right-32 -top-24 h-[28rem] w-[28rem] rounded-full bg-[var(--lp-brand)] opacity-[0.08] blur-[120px]"
                />
                <div className="mx-auto max-w-7xl px-6 pb-20 pt-16 md:px-12 md:pb-28 md:pt-24">
                    <Reveal className="flex flex-col gap-6">
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                            <Link href="/use-cases" className="lp-mono text-[11px] uppercase tracking-[0.28em] text-[var(--lp-dim)] transition-colors hover:text-[var(--lp-text)]">
                                ← All use cases
                            </Link>
                            <SceneLabel index={String(index + 1).padStart(2, '0')} label={uc.eyebrow} />
                        </div>

                        <h1 className="lp-display max-w-5xl text-5xl leading-[0.9] text-[var(--lp-text)] md:text-8xl">
                            <MaskedLines lines={twoLines(uc.headline)} />
                        </h1>

                        <p className="max-w-xl text-lg leading-relaxed text-[var(--lp-muted)] md:text-xl">{uc.subhead}</p>

                        <div className="mt-2 flex flex-wrap items-center gap-3">
                            <Magnetic>
                                <Link
                                    href="/ticketing"
                                    className="group inline-flex items-center gap-2 rounded-full bg-[var(--lp-brand)] px-7 py-3.5 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--lp-brand-fg)] shadow-[0_8px_22px_-8px_rgba(79,70,229,0.6)] transition-shadow hover:shadow-[0_12px_30px_-8px_rgba(79,70,229,0.75)]"
                                >
                                    Start selling
                                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                                </Link>
                            </Magnetic>
                            <Link
                                href="/pricing"
                                className="inline-flex items-center gap-2 rounded-full border border-[var(--lp-line-strong)] px-7 py-3.5 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--lp-text)] transition-colors hover:border-[var(--lp-brand-soft)] hover:bg-[var(--lp-deep)]"
                            >
                                See pricing
                            </Link>
                        </div>

                        <ul className="mt-6 flex flex-wrap gap-2">
                            {uc.features.map((f) => (
                                <li key={f} className="lp-mono rounded-full border border-[var(--lp-line-strong)] px-3.5 py-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--lp-muted)]">
                                    {f}
                                </li>
                            ))}
                        </ul>
                    </Reveal>
                </div>
                <div className="lp-rule" />
            </section>

            {/* ── Problem → what HangHut does ─────────────────────────── */}
            <section className="py-24 md:py-32">
                <div className="mx-auto max-w-7xl px-6 md:px-12">
                    <Reveal className="flex flex-col gap-6">
                        <SceneLabel index="A" label="The job" />
                        <h2 className="lp-display max-w-3xl text-4xl leading-[0.92] text-[var(--lp-text)] md:text-6xl">
                            <MaskedLines lines={['Three things that break,', 'and what we do about each.']} />
                        </h2>
                    </Reveal>

                    <div className="mt-14 overflow-hidden rounded-[28px] border border-[var(--lp-line-strong)] bg-[var(--lp-line)]">
                        <div className="hidden grid-cols-[3rem_1fr_1fr] gap-px bg-[var(--lp-line)] md:grid">
                            <div className="bg-[var(--lp-deep)]" />
                            <div className="lp-mono bg-[var(--lp-deep)] px-8 py-4 text-[10px] uppercase tracking-[0.3em] text-[var(--lp-dim)]">The problem</div>
                            <div className="lp-mono bg-[var(--lp-deep)] px-8 py-4 text-[10px] uppercase tracking-[0.3em] text-[var(--lp-brand)]">With HangHut</div>
                        </div>
                        {pairs.map((p, i) => (
                            <Reveal key={p.challenge.title} delay={i * 0.06} amount={0.2}>
                                <div className="grid gap-px bg-[var(--lp-line)] md:grid-cols-[3rem_1fr_1fr]">
                                    <div className="lp-mono flex items-start bg-[var(--lp-void)] px-4 pt-8 text-[12px] text-[var(--lp-brand-soft)] md:justify-center md:px-0">
                                        {String(i + 1).padStart(2, '0')}
                                    </div>
                                    <div className="bg-[var(--lp-void)] px-6 py-6 md:px-8 md:py-8">
                                        <p className="lp-mono mb-2 text-[10px] uppercase tracking-[0.3em] text-[var(--lp-dim)] md:hidden">The problem</p>
                                        <h3 className="text-lg font-semibold text-[var(--lp-text)]">{p.challenge.title}</h3>
                                        <p className="mt-2 max-w-md text-[15px] leading-relaxed text-[var(--lp-muted)]">{p.challenge.body}</p>
                                    </div>
                                    <div className="bg-[var(--lp-void)] px-6 py-6 md:bg-[var(--lp-deep)]/60 md:px-8 md:py-8">
                                        <p className="lp-mono mb-2 text-[10px] uppercase tracking-[0.3em] text-[var(--lp-brand)] md:hidden">With HangHut</p>
                                        {p.solution ? (
                                            <>
                                                <h3 className="text-lg font-semibold text-[var(--lp-text)]">{p.solution.title}</h3>
                                                <p className="mt-2 max-w-md text-[15px] leading-relaxed text-[var(--lp-muted)]">{p.solution.body}</p>
                                            </>
                                        ) : null}
                                    </div>
                                </div>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Built in ───────────────────────────────────────────── */}
            <section className="border-y border-[var(--lp-line)] bg-[var(--lp-deep)] py-24 md:py-32">
                <div className="mx-auto max-w-7xl px-6 md:px-12">
                    <Reveal className="flex flex-col gap-6">
                        <SceneLabel index="B" label="Built in" />
                        <h2 className="lp-display max-w-3xl text-4xl leading-[0.92] text-[var(--lp-text)] md:text-6xl">
                            <MaskedLines lines={['Nothing to bolt on.']} />
                        </h2>
                        <p className="max-w-xl text-lg leading-relaxed text-[var(--lp-muted)]">
                            The features {uc.name.toLowerCase()} organizers reach for first, already switched on.
                        </p>
                    </Reveal>

                    <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-[28px] border border-[var(--lp-line-strong)] bg-[var(--lp-line)] sm:grid-cols-2 lg:grid-cols-3">
                        {uc.features.map((f, i) => {
                            const Icon = featureIcon(f)
                            return (
                                <Reveal key={f} delay={(i % 3) * 0.05} amount={0.15} className="h-full">
                                    <div className="group flex h-full items-center gap-5 bg-[var(--lp-void)] p-7 transition-colors duration-500 hover:bg-[var(--lp-deep)]">
                                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--lp-line-strong)] bg-[var(--lp-brand)]/10 text-[var(--lp-brand-soft)] transition-all duration-500 group-hover:border-[var(--lp-brand-soft)] group-hover:bg-[var(--lp-brand)]/25">
                                            <Icon className="h-5 w-5" />
                                        </span>
                                        <span className="text-[15px] font-semibold text-[var(--lp-text)]">{f}</span>
                                    </div>
                                </Reveal>
                            )
                        })}
                        <Reveal delay={0.15} amount={0.15} className="h-full">
                            <Link href="/ticketing" className="group flex h-full items-center justify-between gap-5 bg-[var(--lp-brand)] p-7 text-[var(--lp-brand-fg)] transition-colors hover:bg-[var(--lp-brand-soft)]">
                                <span className="text-[15px] font-semibold">And everything on the platform</span>
                                <ArrowUpRight className="h-5 w-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                            </Link>
                        </Reveal>
                    </div>
                </div>
            </section>

            {/* ── How it works ──────────────────────────────────────── */}
            <section className="py-24 md:py-32">
                <div className="mx-auto max-w-7xl px-6 md:px-12">
                    <Reveal className="flex flex-col gap-6">
                        <SceneLabel index="C" label="How it works" />
                        <h2 className="lp-display max-w-3xl text-4xl leading-[0.92] text-[var(--lp-text)] md:text-6xl">
                            <MaskedLines lines={['Live before lunch.']} />
                        </h2>
                    </Reveal>

                    <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
                        {STEPS.map((s, i) => {
                            const Icon = s.icon
                            return (
                                <Reveal key={s.n} delay={i * 0.08} amount={0.3}>
                                    <div className="border-t border-[var(--lp-line-strong)] pt-7">
                                        <div className="flex items-center justify-between">
                                            <span className="lp-mono text-[12px] text-[var(--lp-brand-soft)]">{s.n}</span>
                                            <Icon className="h-5 w-5 text-[var(--lp-dim)]" />
                                        </div>
                                        <h3 className="lp-display mt-6 text-2xl text-[var(--lp-text)]">{s.title}</h3>
                                        <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-[var(--lp-muted)]">{s.body}</p>
                                    </div>
                                </Reveal>
                            )
                        })}
                    </div>
                </div>
            </section>

            {/* ── FAQ ───────────────────────────────────────────────── */}
            <section className="border-t border-[var(--lp-line)] py-24 md:py-32">
                <div className="mx-auto grid max-w-7xl gap-12 px-6 md:grid-cols-[1fr_1.6fr] md:px-12">
                    <Reveal className="flex flex-col gap-6">
                        <SceneLabel index="D" label="Questions" />
                        <h2 className="lp-display text-4xl leading-[0.92] text-[var(--lp-text)] md:text-6xl">
                            <MaskedLines lines={['Before you', 'ask.']} />
                        </h2>
                    </Reveal>
                    <Reveal delay={0.1} className="divide-y divide-[var(--lp-line)] border-y border-[var(--lp-line)]">
                        {faqs.map((f) => (
                            <details key={f.q} className="group py-5">
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[17px] font-semibold text-[var(--lp-text)]">
                                    {f.q}
                                    <ChevronDown className="h-5 w-5 shrink-0 text-[var(--lp-dim)] transition-transform duration-300 group-open:rotate-180" />
                                </summary>
                                <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--lp-muted)]">{f.a}</p>
                            </details>
                        ))}
                    </Reveal>
                </div>
            </section>

            {/* ── Close (shared with the landing) ───────────────────── */}
            <CTA />

            {/* ── Other use cases ───────────────────────────────────── */}
            <section className="pb-24 md:pb-32">
                <div className="mx-auto max-w-7xl px-6 md:px-12">
                    <p className="lp-mono text-[11px] uppercase tracking-[0.28em] text-[var(--lp-dim)]">More use cases</p>
                    <ul className="mt-6 grid gap-px overflow-hidden rounded-[22px] border border-[var(--lp-line-strong)] bg-[var(--lp-line)] sm:grid-cols-2 lg:grid-cols-5">
                        {others.map((u) => (
                            <li key={u.slug}>
                                <Link
                                    href={`/use-cases/${u.slug}`}
                                    className="group flex h-full items-center gap-3 bg-[var(--lp-void)] px-5 py-4 text-[14px] font-semibold text-[var(--lp-text)] transition-colors hover:bg-[var(--lp-deep)]"
                                >
                                    <span aria-hidden className="text-lg leading-none">{u.emoji}</span>
                                    <span className="flex-1">{u.name}</span>
                                    <ArrowRight className="h-4 w-4 -translate-x-1 text-[var(--lp-dim)] opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>
        </>
    )
}
