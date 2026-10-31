"use client";

import { useEffect, useState } from "react";

// Renumbered 2026-10-31 when the film scene was removed. These numbers are the
// visible scene index, so they have to stay contiguous -- a rail that reads
// 02..06 announces a missing first scene. The ids must also match real elements:
// the observer below silently drops any that do not resolve, so a stale entry
// here becomes a rail item that never lights up and scrolls nowhere.
const SCENES = [
    { id: "scene-discover", n: "01", label: "Go out" },
    { id: "scene-platform", n: "02", label: "Run it" },
    { id: "scene-pricing", n: "03", label: "Pricing" },
    { id: "scene-trust", n: "04", label: "Trust" },
    { id: "scene-start", n: "05", label: "Start" },
];

/**
 * Fixed scene index down the left edge — where you are in the night, and how
 * much of it is left. Desktop only; on a phone it would sit on the content, and
 * the header's progress hairline already answers the same question there.
 *
 * Driven by IntersectionObserver against the section elements rather than by
 * scroll offsets, so it stays correct when a section's height changes with the
 * viewport (which every one of these does).
 */
export default function Rail() {
    const [active, setActive] = useState<string | null>(null);

    useEffect(() => {
        const targets = SCENES.map((s) => document.getElementById(s.id)).filter(
            (el): el is HTMLElement => el !== null,
        );
        if (targets.length === 0) return;

        const io = new IntersectionObserver(
            (entries) => {
                // The scene occupying the middle band of the viewport wins, so a
                // tall section doesn't hand the highlight to whatever is entering.
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
                if (visible) setActive(visible.target.id);
            },
            { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.25, 0.5, 1] },
        );

        targets.forEach((t) => io.observe(t));
        return () => io.disconnect();
    }, []);

    return (
        <nav
            aria-label="Page sections"
            className="pointer-events-none fixed left-6 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-5 xl:flex"
        >
            {SCENES.map((s) => {
                const on = active === s.id;
                return (
                    <a
                        key={s.id}
                        href={`#${s.id}`}
                        className="pointer-events-auto group flex items-center gap-3"
                    >
                        <span
                            className={`h-px transition-all duration-500 ${
                                on ? "w-7 bg-[var(--lp-brand-soft)]" : "w-3 bg-[var(--lp-line-strong)]"
                            }`}
                        />
                        <span
                            className={`lp-mono text-[10px] uppercase tracking-[0.2em] transition-all duration-500 ${
                                on
                                    ? "text-[var(--lp-text)] opacity-100"
                                    : "text-[var(--lp-dim)] opacity-0 group-hover:opacity-100"
                            }`}
                        >
                            {s.n} {s.label}
                        </span>
                    </a>
                );
            })}
        </nav>
    );
}
