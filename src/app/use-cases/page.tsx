import type { Metadata } from 'next'
import Link from 'next/link'
import { USE_CASES } from '@/lib/marketing/use-cases'
import { MaskedLines, Reveal, SceneLabel } from '@/components/landing/scenes/primitives'
import CTA from '@/components/landing/scenes/cta'
import { ArrowUpRight } from 'lucide-react'

export const metadata: Metadata = {
    title: 'Use Cases — HangHut for every kind of event',
    description: 'See how live-music promoters, gyms, markets, workshops, conferences, and communities use HangHut to sell tickets, take RSVPs, and run a smooth door.',
}

const PROOF = ['No monthly fees', 'GCash · cards · QRPh', 'Payouts to your bank', 'Built in the Philippines']

/**
 * The hub. Six verticals on one hairline grid, each tile leading with the
 * headline its own page opens on — so the grid reads as six promises, not
 * six categories. Same tokens and type as the landing; the old page's
 * three-colour blur hero and rainbow accents are gone.
 */
export default function UseCasesHubPage() {
    return (
        <>
            {/* ── Hero ─────────────────────────────────────────────────── */}
            <section className="relative overflow-hidden pt-20">
                <div
                    aria-hidden
                    className="pointer-events-none absolute -left-32 top-10 h-[28rem] w-[28rem] rounded-full bg-[var(--lp-brand)] opacity-[0.08] blur-[120px]"
                />
                <div className="mx-auto max-w-7xl px-6 pb-16 pt-16 md:px-12 md:pb-24 md:pt-24">
                    <Reveal className="flex flex-col gap-6">
                        <SceneLabel index="00" label="Use cases" />
                        <h1 className="lp-display max-w-5xl text-5xl leading-[0.9] text-[var(--lp-text)] md:text-8xl">
                            <MaskedLines
                                lines={[
                                    'Whatever you run,',
                                    <span key="b" className="bg-gradient-to-r from-[var(--lp-brand-soft)] to-[var(--lp-brand)] bg-clip-text text-transparent">
                                        run it here.
                                    </span>,
                                ]}
                            />
                        </h1>
                        <p className="max-w-xl text-lg leading-relaxed text-[var(--lp-muted)] md:text-xl">
                            Gigs, races, markets, classes, conferences, meetups. One platform that
                            sells the ticket, checks the name, and pays you out.
                        </p>
                        <ul className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
                            {PROOF.map((p) => (
                                <li key={p} className="lp-mono text-[11px] uppercase tracking-[0.22em] text-[var(--lp-dim)]">{p}</li>
                            ))}
                        </ul>
                    </Reveal>
                </div>
                <div className="lp-rule" />
            </section>

            {/* ── The six ─────────────────────────────────────────────── */}
            <section className="py-20 md:py-28">
                <div className="mx-auto max-w-7xl px-6 md:px-12">
                    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[28px] border border-[var(--lp-line-strong)] bg-[var(--lp-line)] md:grid-cols-2 lg:grid-cols-3">
                        {USE_CASES.map((uc, i) => (
                            <Reveal key={uc.slug} delay={(i % 3) * 0.06} amount={0.15} className="h-full">
                                <Link
                                    href={`/use-cases/${uc.slug}`}
                                    className="group relative flex h-full min-h-[22rem] flex-col bg-[var(--lp-void)] p-8 transition-colors duration-500 hover:bg-[var(--lp-deep)]"
                                >
                                    <div className="flex items-start justify-between">
                                        <span aria-hidden className="text-3xl leading-none">{uc.emoji}</span>
                                        <span className="lp-mono text-[11px] text-[var(--lp-dim)]">{String(i + 1).padStart(2, '0')}</span>
                                    </div>

                                    <div className="mt-auto pt-10">
                                        <p className="lp-mono text-[10px] uppercase tracking-[0.3em] text-[var(--lp-dim)]">{uc.name}</p>
                                        <h2 className="lp-display mt-3 text-3xl leading-[0.95] text-[var(--lp-text)] md:text-4xl">{uc.headline}</h2>
                                        <p className="mt-3 line-clamp-2 text-[15px] leading-relaxed text-[var(--lp-muted)]">{uc.subhead}</p>
                                        <ul className="mt-5 flex flex-wrap gap-1.5">
                                            {uc.features.slice(0, 3).map((f) => (
                                                <li key={f} className="rounded-full border border-[var(--lp-line-strong)] px-2.5 py-1 text-[11px] text-[var(--lp-muted)]">{f}</li>
                                            ))}
                                        </ul>
                                    </div>

                                    <ArrowUpRight className="absolute right-8 top-8 h-5 w-5 -translate-x-1 translate-y-1 text-[var(--lp-brand)] opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100 md:right-8 md:top-16" />
                                </Link>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Close (shared with the landing) ───────────────────── */}
            <CTA />
        </>
    )
}
