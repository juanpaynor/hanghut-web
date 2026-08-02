"use client";

/**
 * Full-bleed marquee band — the kinetic connective tissue between sections.
 * Pure CSS animation (tailwind `animate-marquee`), so it's cheap and honors
 * `prefers-reduced-motion` (globals.css pauses it). Duplicates the items once so
 * the -50% translate loops seamlessly.
 */
export function LiveMarquee({
    items,
    className = "",
    duration = 40,
    accent = "text-kinetic-brand",
    reverse = false,
}: {
    items: string[];
    className?: string;
    duration?: number;
    accent?: string;
    reverse?: boolean;
}) {
    const row = [...items, ...items];
    return (
        <div className={`group relative flex overflow-hidden ${className}`} aria-hidden="true">
            <div
                className="flex shrink-0 items-center gap-8 whitespace-nowrap animate-marquee-loop will-change-transform"
                style={{
                    ["--marquee-duration" as string]: `${duration}s`,
                    animationDirection: reverse ? "reverse" : "normal",
                }}
            >
                {row.map((item, i) => (
                    <span key={i} className="flex items-center gap-8 text-sm font-body uppercase tracking-[0.15em] text-kinetic-muted">
                        {item}
                        <span className={`text-lg leading-none ${accent}`}>&bull;</span>
                    </span>
                ))}
            </div>
        </div>
    );
}
