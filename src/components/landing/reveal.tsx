"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Scroll-reveal for landing sections — fade + lift into view once. Reduced-motion
 * viewers get the content immediately with no transform. Mirrors the events-page
 * Reveal but tuned for the darker, kinetic landing.
 */
export function Reveal({
    children,
    className,
    delay = 0,
    y = 28,
}: {
    children: ReactNode;
    className?: string;
    delay?: number;
    y?: number;
}) {
    const reduce = useReducedMotion();
    if (reduce) return <div className={className}>{children}</div>;
    return (
        <motion.div
            className={className}
            initial={{ opacity: 0, y }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2, margin: "0px 0px -8% 0px" }}
            transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
        >
            {children}
        </motion.div>
    );
}
