"use client";

import { motion } from "framer-motion";

export function Marquee() {
    return (
        <div className="relative flex overflow-hidden py-8 bg-foreground text-background">
            <div className="flex animate-marquee whitespace-nowrap">
                {Array.from({ length: 4 }).map((_, i) => (
                    <span key={i} className="mx-4 text-4xl md:text-6xl font-headline font-bold uppercase tracking-tighter">
                        HIKING — GAMING — ART — TRAVEL — COFFEE —
                    </span>
                ))}
            </div>
            <div className="absolute top-0 flex animate-marquee2 whitespace-nowrap">
                {Array.from({ length: 4 }).map((_, i) => (
                    <span key={i} className="mx-4 text-4xl md:text-6xl font-headline font-bold uppercase tracking-tighter">
                        HIKING — GAMING — ART — TRAVEL — COFFEE —
                    </span>
                ))}
            </div>
        </div>
    );
}
