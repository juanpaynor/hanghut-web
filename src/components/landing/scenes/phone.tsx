"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";

/* ─────────────────────────────────────────────────────────────────────────
   The device frame. Its contents are real captures of the app.

   This started as hand-built DOM screens standing in for screenshots, because
   the only images available were stock illustrations that showed a crowd
   rather than the product. Once real captures arrived the mocks were deleted
   outright — nothing hand-drawn was going to be more convincing than the app,
   and keeping both would have meant a section that alternated between the real
   thing and an approximation of it.

   Every capture carries the phone's own status bar and island, so the frame
   draws neither. It supplies the chassis, the glow, and the crossfade.
   ───────────────────────────────────────────────────────────────────────── */

const EASE = [0.22, 1, 0.36, 1] as const;

export interface PhoneScreen {
    src: string;
    alt: string;
}

export default function Phone({
    screens,
    active,
}: {
    screens: PhoneScreen[];
    active: number;
}) {
    const reduce = useReducedMotion();

    return (
        <div className="relative mx-auto w-full max-w-[300px]">
            {/* Device glow, tinted so the frame sits in the page rather than on it. */}
            <div
                aria-hidden
                className="pointer-events-none absolute -inset-10 rounded-[60px] bg-[var(--lp-brand)]/16 blur-[70px]"
            />

            <div className="relative rounded-[46px] border border-white/12 bg-gradient-to-b from-[#23213a] to-[#0d0d16] p-[10px] shadow-[0_50px_120px_-40px_rgba(91,76,245,0.8)]">
                {/* 603:1311 is the captures' own aspect, so a screenshot fills the
                    screen exactly rather than being cropped to fit a guess. */}
                <div className="relative aspect-[603/1311] overflow-hidden rounded-[38px] bg-[#0b0b14]">
                    {/* All screens stay mounted and stacked. Swapping them with
                        AnimatePresence would mean each capture is first requested
                        at the moment it is needed, and the rotation would blink on
                        its first pass through. Mounted together, they resolve once
                        while the phone scrolls into view. */}
                    {screens.map((screen, i) => {
                        const on = active === i;
                        return (
                            <motion.div
                                key={screen.src}
                                aria-hidden={!on}
                                className="absolute inset-0"
                                initial={false}
                                animate={{
                                    opacity: on ? 1 : 0,
                                    x: reduce ? 0 : on ? 0 : 18,
                                }}
                                transition={{ duration: 0.45, ease: EASE }}
                            >
                                <Image
                                    src={screen.src}
                                    alt={screen.alt}
                                    fill
                                    sizes="300px"
                                    className="object-cover"
                                />
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
