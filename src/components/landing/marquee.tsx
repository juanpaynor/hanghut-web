"use client";

import { motion } from "framer-motion";

const VIBE_TAGS = [
    { label: "Techno Hike", emoji: "🥾" },
    { label: "Rooftop Yoga", emoji: "🧘‍♀️" },
    { label: "Indie Pop Karaoke", emoji: "🎤" },
    { label: "Clay & Chardonnay", emoji: "🍷" },
    { label: "Midnight Run Club", emoji: "🏃‍♂️" },
    { label: "Secret Cinema", emoji: "🎬" },
    { label: "Vinyl Exchange", emoji: "📀" },
    { label: "Full Moon Swim", emoji: "🌕" },
];

export default function Marquee() {
    return (
        <section className="relative w-full py-10 bg-background overflow-hidden border-y border-white/5">
            {/* Gradient Masks */}
            <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-background to-transparent z-10" />
            <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-background to-transparent z-10" />

            <div className="flex w-full whitespace-nowrap">
                <div className="flex animate-marquee items-center gap-12 px-6">
                    {VIBE_TAGS.map((tag, i) => (
                        <div key={i} className="flex items-center gap-3 text-3xl font-headline font-bold text-muted-foreground/40 hover:text-primary transition-colors cursor-default">
                            <span className="grayscale opacity-50">{tag.emoji}</span>
                            <span>#{tag.label}</span>
                        </div>
                    ))}
                    {VIBE_TAGS.map((tag, i) => (
                        <div key={`dup-${i}`} className="flex items-center gap-3 text-3xl font-headline font-bold text-muted-foreground/40 hover:text-primary transition-colors cursor-default">
                            <span className="grayscale opacity-50">{tag.emoji}</span>
                            <span>#{tag.label}</span>
                        </div>
                    ))}
                    {VIBE_TAGS.map((tag, i) => (
                        <div key={`dup2-${i}`} className="flex items-center gap-3 text-3xl font-headline font-bold text-muted-foreground/40 hover:text-primary transition-colors cursor-default">
                            <span className="grayscale opacity-50">{tag.emoji}</span>
                            <span>#{tag.label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
