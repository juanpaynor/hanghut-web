"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Compass, MapPin, Ticket, UserPlus, Users } from "lucide-react";
import { StoreButtons } from "@/components/landing/store-buttons";
import { MaskedLines, Reveal, SceneLabel } from "./primitives";
import Phone from "./phone";

const MODES = [
    {
        icon: MapPin,
        eyebrow: "Discover",
        title: "Find events near you",
        body: "Every event and experience around you, pinned on a live map. Pan the city, tap a poster, see what's on tonight.",
        screen: {
            src: "/app/Discover_map.png",
            alt: "The HangHut map of Metro Manila with event posters pinned across Quezon City, Malate and Makati",
        },
    },
    {
        icon: Compass,
        eyebrow: "Experiences",
        title: "Join curated experiences",
        body: "Hand-picked, verified experiences run by trusted local hosts — filter events from experiences, free from paid, any date. No guesswork.",
        screen: {
            src: "/app/discover_events.png",
            alt: "The Explore tab showing a grid of events and experiences with price and free labels, filtered by type and date",
        },
    },
    {
        icon: Ticket,
        eyebrow: "Tickets",
        title: "Get in with a couple of taps",
        body: "Full event page, live countdown, tier pricing and your ticket in the app. Pay with GCash, Maya, QRPh or a card.",
        screen: {
            src: "/app/buy_tickets_for_events.png",
            alt: "An event page for KOOLCHELLA with a countdown, venue, ticket price range and a Buy Tickets button",
        },
    },
    {
        icon: Users,
        eyebrow: "Community",
        title: "See what your people are up to",
        body: "Follow the hosts and friends you like. Everything they create — events, hangouts, plans — lands in your feed, so you always know what's on.",
        screen: {
            src: "/app/explore_feed.png",
            alt: "The Feed tab with For You and Following, showing posts from people who created events and hangouts",
        },
    },
    {
        icon: UserPlus,
        eyebrow: "Hangouts",
        title: "Meet people, make plans",
        body: "Start your own hangout or join one nearby — coffee, hiking, gaming, whatever you're into. Spots, a host, a group chat. Real connections, offline.",
        screen: {
            src: "/app/join_hangout.png",
            alt: "A hangout called Food crawl in San Juan City with three of six spots taken, its host, who is joining, and a chat button",
        },
    },
];

const SCREENS = MODES.map((m) => m.screen);

const DWELL = 5200;

/**
 * Scene 02 — the app half, on one screen.
 *
 * This replaced a three-screen scroll track whose right half was four stock
 * illustrations. Four bullet points did not earn three screens, and the
 * illustrations showed a crowd rather than the product. Now a single phone
 * cycles the four modes while the list beside it advances, so the scene is
 * shorter, shows the actual app, and carries the same four pieces of copy.
 *
 * The cycle is on a timer rather than on scroll position: tying it to scroll
 * meant the section had to be tall enough to scrub through, which is the very
 * thing that made the old version long.
 */
export default function Discover() {
    const [active, setActive] = useState(0);
    const [paused, setPaused] = useState(false);
    const reduce = useReducedMotion();
    const inView = useRef(true);

    const select = useCallback((i: number) => {
        setActive(i);
        // A deliberate choice should hold; the timer restarts from this mode.
        setPaused(false);
    }, []);

    useEffect(() => {
        // No auto-advance under reduced motion, or while the visitor is reading
        // one of the items. The list stays fully operable by click either way.
        if (reduce || paused) return;
        const id = setInterval(() => {
            if (inView.current) setActive((i) => (i + 1) % MODES.length);
        }, DWELL);
        return () => clearInterval(id);
    }, [reduce, paused, active]);

    return (
        <section className="relative bg-[var(--lp-deep)] py-24 md:py-32">
            <div className="mx-auto max-w-7xl px-6 md:px-12">
                <Reveal className="flex flex-col gap-6">
                    <SceneLabel index="02" label="For everyone going out" />
                    <h2 className="lp-display max-w-3xl text-4xl leading-[0.92] text-[var(--lp-text)] md:text-7xl">
                        <MaskedLines lines={["Find your people."]} />
                    </h2>
                    <p className="max-w-xl text-lg leading-relaxed text-[var(--lp-muted)]">
                        Everything to discover what&apos;s on and who&apos;s going — in one app.
                    </p>
                </Reveal>

                <motion.div
                    onViewportEnter={() => {
                        inView.current = true;
                    }}
                    onViewportLeave={() => {
                        inView.current = false;
                    }}
                    viewport={{ amount: 0.2 }}
                    className="mt-16 grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:gap-20"
                >
                    {/* The four modes. Titles always visible; the body of the live
                        one expands. Every body stays in the DOM either way, so
                        nothing here is hidden from a crawler or a screen reader. */}
                    <ul className="order-2 flex flex-col lg:order-1">
                        {MODES.map((mode, i) => {
                            const Icon = mode.icon;
                            const on = active === i;
                            return (
                                <li key={mode.title} className="border-b border-[var(--lp-line)] last:border-b-0">
                                    <button
                                        type="button"
                                        onClick={() => select(i)}
                                        onMouseEnter={() => setPaused(true)}
                                        onMouseLeave={() => setPaused(false)}
                                        onFocus={() => setPaused(true)}
                                        onBlur={() => setPaused(false)}
                                        aria-expanded={on}
                                        className="group relative w-full py-7 text-left focus-visible:outline-none"
                                    >
                                        {/* Dwell indicator — the line fills for as long as
                                            this mode is up, so the rotation is legible
                                            rather than something that just happens. */}
                                        <span className="absolute inset-x-0 bottom-[-1px] h-px overflow-hidden">
                                            {on && !reduce && !paused && (
                                                <motion.span
                                                    key={`${active}-${paused}`}
                                                    className="block h-full origin-left bg-[var(--lp-brand-soft)]"
                                                    initial={{ scaleX: 0 }}
                                                    animate={{ scaleX: 1 }}
                                                    transition={{ duration: DWELL / 1000, ease: "linear" }}
                                                />
                                            )}
                                        </span>

                                        <div className="flex items-start gap-5">
                                            <span
                                                className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-colors duration-500 ${
                                                    on
                                                        ? "border-[var(--lp-brand-soft)] bg-[var(--lp-brand)]/25 text-[var(--lp-brand-soft)]"
                                                        : "border-[var(--lp-line)] text-[var(--lp-dim)] group-hover:border-[var(--lp-line-strong)] group-hover:text-[var(--lp-muted)]"
                                                }`}
                                            >
                                                <Icon className="h-5 w-5" />
                                            </span>

                                            <div className="min-w-0 flex-1">
                                                <span className="lp-mono text-[10px] uppercase tracking-[0.26em] text-[var(--lp-dim)]">
                                                    {String(i + 1).padStart(2, "0")} · {mode.eyebrow}
                                                </span>
                                                <h3
                                                    className={`lp-display mt-2 text-2xl leading-tight transition-colors duration-500 md:text-3xl ${
                                                        on ? "text-[var(--lp-text)]" : "text-[var(--lp-muted)]"
                                                    }`}
                                                >
                                                    {mode.title}
                                                </h3>

                                                {/* Always mounted, collapsed when idle: an
                                                    AnimatePresence here would unmount three of
                                                    the four bodies, and the page would ship a
                                                    quarter of its copy to a crawler. */}
                                                <motion.p
                                                    initial={false}
                                                    animate={{ height: on ? "auto" : 0, opacity: on ? 1 : 0 }}
                                                    transition={reduce ? { duration: 0 } : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                                                    className="overflow-hidden text-base leading-relaxed text-[var(--lp-muted)]"
                                                >
                                                    <span className="block pt-3">{mode.body}</span>
                                                </motion.p>
                                            </div>
                                        </div>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>

                    <div className="order-1 lg:order-2">
                        <Phone screens={SCREENS} active={active} />
                    </div>
                </motion.div>

                <Reveal className="mt-20 overflow-hidden rounded-[32px] border border-[var(--lp-line-strong)] bg-[var(--lp-panel)]">
                    <div className="relative flex flex-col items-center gap-6 px-6 py-14 text-center">
                        <div
                            aria-hidden
                            className="pointer-events-none absolute inset-x-0 -top-20 h-40 bg-[var(--lp-brand)]/12 blur-[80px]"
                        />
                        <h3 className="lp-display relative text-2xl text-[var(--lp-text)] md:text-4xl">
                            Get the app. Go do something.
                        </h3>
                        <p className="relative max-w-md text-[var(--lp-muted)]">
                            Free on iOS and Android — your next hangout is a tap away.
                        </p>
                        <div className="relative">
                            <StoreButtons variant="dark" />
                        </div>
                    </div>
                </Reveal>
            </div>
        </section>
    );
}
