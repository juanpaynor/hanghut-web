"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "motion/react";

const STATS = [
    { value: 500, prefix: "", suffix: "+", label: "Events hosted" },
    { value: 25000, prefix: "", suffix: "+", label: "Tickets sold" },
    { value: 40, prefix: "", suffix: "", label: "Cities" },
    { value: 12, prefix: "₱", suffix: "M+", label: "Paid out to hosts" },
];

function useCountUp(target: number, run: boolean, reduce: boolean) {
    const [n, setN] = useState(reduce ? target : 0);
    useEffect(() => {
        if (!run || reduce) { setN(target); return; }
        let raf = 0;
        const start = performance.now();
        const dur = 1400;
        const tick = (t: number) => {
            const p = Math.min((t - start) / dur, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            setN(Math.round(target * eased));
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [run, target, reduce]);
    return n;
}

function Stat({ stat, run }: { stat: (typeof STATS)[number]; run: boolean }) {
    const reduce = useReducedMotion() ?? false;
    const n = useCountUp(stat.value, run, reduce);
    const display = n >= 1000 ? n.toLocaleString() : String(n);
    return (
        <div className="flex flex-col items-center px-4 text-center">
            <span className="font-headline text-4xl font-extrabold tabular-nums text-kinetic-text md:text-5xl">
                {stat.prefix}{display}{stat.suffix}
            </span>
            <span className="mt-2 font-body text-[11px] uppercase tracking-[0.2em] text-kinetic-muted">{stat.label}</span>
        </div>
    );
}

export default function StatsStrip() {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { once: true, amount: 0.5 });
    return (
        <section ref={ref} className="border-b border-kinetic-line bg-kinetic-ink py-14">
            <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-10 px-6 md:grid-cols-4 md:px-12">
                {STATS.map((s) => (
                    <Stat key={s.label} stat={s} run={inView} />
                ))}
            </div>
        </section>
    );
}
