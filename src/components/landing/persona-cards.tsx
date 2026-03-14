"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Compass, Mic2, Footprints } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const personas = [
    {
        icon: Compass,
        title: "The Explorer",
        subtitle: "That's you if...",
        description: "You're always looking for something new to do this weekend. You hate FOMO and love spontaneous plans.",
        bg: "#EEF2FF",       // indigo-50
        accent: "#6366F1",   // indigo-500
        textColor: "#312E81", // indigo-900
    },
    {
        icon: Mic2,
        title: "The Host",
        subtitle: "That's you if...",
        description: "You love bringing people together. Whether it's a rooftop party or a chill dinner — you make it happen.",
        bg: "#FFF7ED",       // orange-50
        accent: "#F97316",   // orange-500
        textColor: "#7C2D12", // orange-900
    },
    {
        icon: Footprints,
        title: "The Joiner",
        subtitle: "That's you if...",
        description: "You just want to tag along and meet cool people. You say yes to everything. You're the life of the party.",
        bg: "#ECFDF5",       // emerald-50
        accent: "#10B981",   // emerald-500
        textColor: "#064E3B", // emerald-900
    },
];

export default function PersonaCards() {
    const sectionRef = useRef<HTMLDivElement>(null);
    const slidesRef = useRef<(HTMLDivElement | null)[]>([]);
    const bgRef = useRef<HTMLDivElement>(null);
    const headingRef = useRef<HTMLDivElement>(null);
    const counterRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        const ctx = gsap.context(() => {
            const section = sectionRef.current;
            if (!section) return;

            const tl = gsap.timeline({
                scrollTrigger: {
                    trigger: section,
                    start: "top top",
                    end: `+=${personas.length * 100}%`,
                    pin: true,
                    scrub: 0.8,
                    anticipatePin: 1,
                },
            });

            // Heading entrance
            tl.fromTo(
                headingRef.current,
                { opacity: 0, y: -30 },
                { opacity: 1, y: 0, duration: 0.2 }
            );

            // First slide entrance
            tl.fromTo(
                slidesRef.current[0],
                { opacity: 0, y: 40 },
                { opacity: 1, y: 0, duration: 0.3 }
            );

            // Animate through each persona
            slidesRef.current.forEach((slide, i) => {
                if (!slide || i === 0) return;

                const prevSlide = slidesRef.current[i - 1];
                if (!prevSlide) return;

                // Transition: fade out current, change bg, fade in next
                tl.to(prevSlide, {
                    opacity: 0,
                    y: -40,
                    scale: 0.95,
                    duration: 0.3,
                });

                // Background color shift
                tl.to(bgRef.current, {
                    backgroundColor: personas[i].bg,
                    duration: 0.3,
                }, "<0.1");

                // Counter update
                tl.to(counterRef.current, {
                    innerText: `${i + 1}`,
                    snap: { innerText: 1 },
                    duration: 0.1,
                }, "<");

                // New slide entrance
                tl.fromTo(
                    slide,
                    { opacity: 0, y: 40, scale: 0.95 },
                    { opacity: 1, y: 0, scale: 1, duration: 0.3 },
                    "-=0.1"
                );

                // Hold on this slide
                tl.to({}, { duration: 0.2 });
            });

            // Hold at end
            tl.to({}, { duration: 0.3 });

        }, sectionRef);

        return () => ctx.revert();
    }, []);

    return (
        <section
            ref={sectionRef}
            className="relative w-full h-screen overflow-hidden"
        >
            {/* Animated background */}
            <div
                ref={bgRef}
                className="absolute inset-0 transition-colors duration-300"
                style={{ backgroundColor: personas[0].bg }}
            />

            {/* Fixed heading */}
            <div ref={headingRef} className="absolute top-12 md:top-16 left-0 right-0 z-10 text-center px-4">
                <p className="text-sm font-bold uppercase tracking-[0.3em] text-slate-500 mb-2">
                    Who It&apos;s For
                </p>
                <h2 className="text-3xl md:text-4xl font-headline font-bold tracking-tight text-slate-800">
                    Which one are you?
                </h2>
            </div>

            {/* Counter */}
            <div className="absolute bottom-12 md:bottom-16 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3">
                <span ref={counterRef} className="text-2xl font-bold text-slate-400 font-headline">1</span>
                <span className="text-lg text-slate-300">/</span>
                <span className="text-lg text-slate-400">{personas.length}</span>
            </div>

            {/* Persona slides */}
            <div className="absolute inset-0 flex items-center justify-center">
                {personas.map((persona, i) => {
                    const Icon = persona.icon;
                    return (
                        <div
                            key={i}
                            ref={(el) => { slidesRef.current[i] = el; }}
                            className="absolute inset-0 flex items-center justify-center px-6"
                            style={{ opacity: i === 0 ? 1 : 0 }}
                        >
                            <div className="text-center max-w-2xl mx-auto space-y-8">
                                {/* Icon */}
                                <div
                                    className="w-24 h-24 md:w-32 md:h-32 rounded-[32px] mx-auto flex items-center justify-center shadow-2xl"
                                    style={{ backgroundColor: persona.accent }}
                                >
                                    <Icon className="w-12 h-12 md:w-16 md:h-16 text-white" strokeWidth={1.5} />
                                </div>

                                {/* Title */}
                                <h3
                                    className="text-5xl md:text-7xl lg:text-8xl font-headline font-bold tracking-tighter leading-none"
                                    style={{ color: persona.textColor }}
                                >
                                    {persona.title}
                                </h3>

                                {/* Subtitle */}
                                <p
                                    className="text-sm font-bold uppercase tracking-[0.2em]"
                                    style={{ color: persona.accent }}
                                >
                                    {persona.subtitle}
                                </p>

                                {/* Description */}
                                <p
                                    className="text-xl md:text-2xl font-light leading-relaxed max-w-lg mx-auto"
                                    style={{ color: persona.textColor, opacity: 0.7 }}
                                >
                                    {persona.description}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
