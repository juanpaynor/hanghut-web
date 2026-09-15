"use client";

import Image from "next/image";
import Link from "next/link";
import { useReducedMotion } from "motion/react";
import { Reveal } from "./primitives";

/**
 * The lineup — who is already running their shows on HangHut.
 *
 * Set as a POSTER LINEUP, not a logo strip and not a grid of tiles. The assets
 * partners hand over are profile pictures — square, full-colour, each on its
 * own background — and any design that asks the images to carry the row
 * exposes that: a greyscale band turns them into black squares, a tile grid
 * turns them into a mismatched App Store shelf.
 *
 * So the NAMES carry it. Display type, uppercase, big, run together with a
 * brand mark between them the way a festival poster bills its acts. The image
 * rides along as a small avatar, at a size where a caricature, a watermark or a
 * 225px source all stop mattering and simply read as "this act has a face".
 *
 * One continuous ticker rather than a static row: seven names at poster size
 * do not fit a viewport, and a wrapped stack of them is a list, not a bill.
 * Pauses on hover so a name can be read and clicked. Under reduced motion it
 * becomes a centred, wrapping row — still a lineup, just one that holds still.
 */

interface Act {
    name: string;
    file: string;
    /** Storefront slug, when the partner sells on HangHut. */
    slug?: string;
}

const LINEUP: Act[] = [
    { name: "The KoolPals",         file: "koolpals.jpg",      slug: "koolpals" },
    { name: "Comedy Manila",        file: "comedy-manila.jpg", slug: "comedymanila" },
    { name: "Fuego Manila",         file: "fuego.jpg",         slug: "fuego-manila" },
    { name: "Mimic Manila",         file: "mimic.jpg",         slug: "mimic-manila" },
    { name: "Sonnet Entertainment", file: "sonnet.png",        slug: "sonnetentertainment" },
    { name: "URW Manila",           file: "urw-manila.jpg" },
    { name: "TLI",                  file: "tli.jpg" },
];

function ActItem({ act, tabbable }: { act: Act; tabbable: boolean }) {
    const body = (
        <>
            <span className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-lg ring-1 ring-[var(--lp-line-strong)] md:h-12 md:w-12 md:rounded-xl">
                <Image
                    src={`/partners/${act.file}`}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                />
            </span>
            <span className="lp-display whitespace-nowrap text-3xl uppercase leading-none text-[var(--lp-text)]/70 transition-colors duration-300 group-hover:text-[var(--lp-text)] md:text-5xl lg:text-6xl">
                {act.name}
            </span>
        </>
    );
    const cls = "group inline-flex items-center gap-3 md:gap-5";
    return act.slug ? (
        <Link
            href={`/${act.slug}`}
            className={`${cls} rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-brand-soft)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--lp-deep)]`}
            aria-label={`${act.name} on HangHut`}
            // The ticker is doubled for the seamless loop; only one copy takes focus.
            tabIndex={tabbable ? 0 : -1}
            aria-hidden={tabbable ? undefined : true}
        >
            {body}
        </Link>
    ) : (
        <span className={cls} aria-hidden={tabbable ? undefined : true}>{body}</span>
    );
}

/** The bill mark between acts. */
function Mark() {
    return (
        <span aria-hidden className="mx-6 inline-block h-2 w-2 rotate-45 rounded-[2px] bg-[var(--lp-brand)] md:mx-10 md:h-2.5 md:w-2.5" />
    );
}

function Bill({ tabbable }: { tabbable: boolean }) {
    return (
        <span className="inline-flex shrink-0 items-center pr-6 md:pr-10">
            {LINEUP.map((act, i) => (
                <span key={act.name} className="inline-flex items-center">
                    {i > 0 && <Mark />}
                    <ActItem act={act} tabbable={tabbable} />
                </span>
            ))}
            <Mark />
        </span>
    );
}

/** The band between the hero and scene 01. */
export default function Lineup() {
    const reduce = useReducedMotion();

    return (
        <section className="overflow-hidden border-y border-[var(--lp-line)] bg-[var(--lp-deep)] py-12 md:py-16">
            <Reveal className="mb-8 flex items-baseline justify-center gap-3 px-6 md:mb-10">
                <span className="lp-mono text-[10px] uppercase tracking-[0.3em] text-[var(--lp-dim)]">
                    The lineup
                </span>
                <span aria-hidden className="h-px w-8 bg-[var(--lp-line-strong)]" />
                <span className="lp-mono text-[10px] uppercase tracking-[0.3em] text-[var(--lp-dim)]">
                    Already on HangHut
                </span>
            </Reveal>

            {reduce ? (
                <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-5 px-6 md:gap-x-10">
                    {LINEUP.map((act) => <ActItem key={act.name} act={act} tabbable />)}
                </div>
            ) : (
                <div className="lp-lineup relative">
                    {/* Edge fades in the band's own colour, so the bill appears to
                        pass behind the page rather than get cut by it. */}
                    <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[var(--lp-deep)] to-transparent md:w-32" />
                    <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[var(--lp-deep)] to-transparent md:w-32" />
                    <div className="lp-lineup-track flex w-max items-center">
                        <Bill tabbable />
                        <Bill tabbable={false} />
                    </div>
                </div>
            )}
        </section>
    );
}
