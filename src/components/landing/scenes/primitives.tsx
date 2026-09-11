"use client";

import {
    motion,
    useMotionValue,
    useMotionValueEvent,
    useReducedMotion,
    useSpring,
} from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

/* ─────────────────────────────────────────────────────────────────────────
   Shared motion primitives for the landing.

   Every one of these degrades to a plain static element under
   `prefers-reduced-motion`. That is checked once per component via
   `useReducedMotion` and branched at the top, rather than setting zero
   durations — a zero-duration animation still runs a frame loop.
   ───────────────────────────────────────────────────────────────────────── */

const EASE = [0.22, 1, 0.36, 1] as const;

/** Fade + lift into view, once. The workhorse. */
export function Reveal({
    children,
    className,
    delay = 0,
    y = 30,
    amount = 0.25,
}: {
    children: ReactNode;
    className?: string;
    delay?: number;
    y?: number;
    amount?: number;
}) {
    const reduce = useReducedMotion();
    if (reduce) return <div className={className}>{children}</div>;
    return (
        <motion.div
            className={className}
            initial={{ opacity: 0, y }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount, margin: "0px 0px -10% 0px" }}
            transition={{ duration: 0.75, delay, ease: EASE }}
        >
            {children}
        </motion.div>
    );
}

/**
 * Headline reveal: each line rises out of its own overflow mask, so the type
 * appears to be lifted off the page rather than faded onto it.
 *
 * Lines are passed explicitly rather than measured, because measuring wrapped
 * lines at runtime means a layout read on every resize and a flash of unmasked
 * text before the first measurement lands.
 *
 * The viewport trigger sits on the OUTER wrapper, not on the span that moves.
 * IntersectionObserver reports intersection after ancestor clipping, so an
 * element parked 110% outside its own `overflow: hidden` parent measures as 0%
 * visible — `whileInView` would never fire, and the line would stay hidden
 * forever because it was hidden. The wrapper is never transformed, so it always
 * reports honestly and drives the child through variants.
 */
export function MaskedLines({
    lines,
    className,
    lineClassName,
    delay = 0,
    stagger = 0.09,
}: {
    lines: ReactNode[];
    className?: string;
    lineClassName?: string;
    delay?: number;
    stagger?: number;
}) {
    const reduce = useReducedMotion();
    return (
        <span className={className}>
            {lines.map((line, i) =>
                reduce ? (
                    <span key={i} className="block overflow-hidden pb-[0.08em]">
                        <span className={lineClassName}>{line}</span>
                    </span>
                ) : (
                    <motion.span
                        key={i}
                        className="block overflow-hidden pb-[0.08em]"
                        initial="hidden"
                        whileInView="show"
                        viewport={{ once: true, amount: 0.15 }}
                    >
                        <motion.span
                            className={`block ${lineClassName ?? ""}`}
                            variants={{ hidden: { y: "110%" }, show: { y: 0 } }}
                            transition={{ duration: 0.9, delay: delay + i * stagger, ease: EASE }}
                        >
                            {line}
                        </motion.span>
                    </motion.span>
                ),
            )}
        </span>
    );
}

/**
 * Pulls its child a little toward the pointer while the pointer is near.
 * Applied to the primary CTAs only — a page where everything is magnetic is a
 * page where nothing reads as the main action.
 */
export function Magnetic({
    children,
    className,
    strength = 0.32,
}: {
    children: ReactNode;
    className?: string;
    strength?: number;
}) {
    const reduce = useReducedMotion();
    const ref = useRef<HTMLSpanElement>(null);
    const x = useSpring(useMotionValue(0), { stiffness: 220, damping: 18, mass: 0.4 });
    const y = useSpring(useMotionValue(0), { stiffness: 220, damping: 18, mass: 0.4 });

    useEffect(() => {
        if (reduce) return;
        const el = ref.current;
        if (!el) return;
        // Coarse pointers have no hover state to be magnetic during.
        if (!window.matchMedia("(hover: hover)").matches) return;

        const onMove = (e: PointerEvent) => {
            const r = el.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const dx = e.clientX - cx;
            const dy = e.clientY - cy;
            const radius = Math.max(r.width, r.height) * 0.9;
            if (Math.hypot(dx, dy) > radius) {
                x.set(0);
                y.set(0);
                return;
            }
            x.set(dx * strength);
            y.set(dy * strength);
        };
        const onLeave = () => {
            x.set(0);
            y.set(0);
        };

        window.addEventListener("pointermove", onMove, { passive: true });
        window.addEventListener("pointerleave", onLeave);
        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerleave", onLeave);
        };
    }, [reduce, strength, x, y]);

    if (reduce) return <span className={className}>{children}</span>;
    return (
        <motion.span ref={ref} style={{ x, y }} className={`inline-block ${className ?? ""}`}>
            {children}
        </motion.span>
    );
}

/** Mono scene marker. The number is real sequence, not decoration. */
export function SceneLabel({ index, label }: { index: string; label: string }) {
    return (
        <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.28em] text-[var(--lp-dim)]">
            <span className="lp-mono text-[var(--lp-brand-soft)]">{index}</span>
            <span className="h-px w-8 bg-[var(--lp-line-strong)]" aria-hidden />
            <span>{label}</span>
        </div>
    );
}

/**
 * Counts a number up when it scrolls into view. Used once, on the fee, because
 * the fee is the single number the page is arguing about.
 *
 * The animated value is written straight to textContent rather than through
 * React state — a spring re-rendering a component every frame is the classic
 * way a "small" count-up ends up dropping frames on the rest of the page.
 */
export function CountUp({
    to,
    decimals = 0,
    className,
}: {
    to: number;
    decimals?: number;
    className?: string;
}) {
    const reduce = useReducedMotion();
    const ref = useRef<HTMLSpanElement>(null);
    const mv = useMotionValue(0);
    const spring = useSpring(mv, { stiffness: 55, damping: 20 });

    useMotionValueEvent(spring, "change", (v) => {
        if (ref.current) ref.current.textContent = v.toFixed(decimals);
    });

    if (reduce) return <span className={className}>{to.toFixed(decimals)}</span>;
    return (
        <motion.span
            ref={ref}
            className={className}
            onViewportEnter={() => mv.set(to)}
            viewport={{ once: true, amount: 0.6 }}
        >
            0
        </motion.span>
    );
}

export { EASE };
