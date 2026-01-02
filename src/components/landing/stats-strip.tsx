"use client";

export default function StatsStrip() {
    const stats = [
        { value: "150k+", label: "Real Moments Shared" },
        { value: "12m", label: "Time-to-Meetup" },
        { value: "0%", label: "Doomscrolling" },
    ];

    return (
        <section className="w-full py-24 bg-background border-y border-border">
            <div className="container mx-auto px-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
                    {stats.map((stat, i) => (
                        <div key={i} className="flex flex-col items-center justify-center space-y-2">
                            <span className="text-6xl md:text-8xl font-headline font-bold tracking-tighter text-primary mobile-glow">
                                {stat.value}
                            </span>
                            <span className="text-sm md:text-base text-muted-foreground uppercase tracking-widest font-medium">
                                {stat.label}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
