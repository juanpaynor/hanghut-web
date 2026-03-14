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
        description: "Always looking for something new to do this weekend. Hates FOMO. Loves spontaneous plans.",
        gradient: "from-indigo-500 to-blue-600",
        border: "border-indigo-200",
        shadow: "shadow-indigo-200/50",
        iconBg: "bg-indigo-100",
        iconColor: "text-indigo-600",
    },
    {
        icon: Mic2,
        title: "The Host",
        description: "Loves bringing people together. Whether it's a rooftop party or a chill dinner, they make it happen.",
        gradient: "from-orange-500 to-red-500",
        border: "border-orange-200",
        shadow: "shadow-orange-200/50",
        iconBg: "bg-orange-100",
        iconColor: "text-orange-600",
    },
    {
        icon: Footprints,
        title: "The Joiner",
        description: "Just wants to tag along and meet cool people. Says yes to everything. The life of the party.",
        gradient: "from-emerald-500 to-teal-500",
        border: "border-emerald-200",
        shadow: "shadow-emerald-200/50",
        iconBg: "bg-emerald-100",
        iconColor: "text-emerald-600",
    },
];

export default function PersonaCards() {
    const sectionRef = useRef<HTMLDivElement>(null);
    const cardsRef = useRef<(HTMLDivElement | null)[]>([]);
    const headingRef = useRef<HTMLDivElement>(null);
    const deckRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const ctx = gsap.context(() => {
            const section = sectionRef.current;
            const deck = deckRef.current;
            if (!section || !deck) return;

            // Initial stacked position: cards overlap in center with slight rotation
            const stackRotations = [-6, 0, 6];
            const stackOffsets = [-8, 0, 8]; // slight vertical stagger

            cardsRef.current.forEach((card, i) => {
                if (!card) return;
                gsap.set(card, {
                    rotation: stackRotations[i],
                    y: stackOffsets[i],
                    x: 0,
                    scale: 1 - (Math.abs(i - 1) * 0.03),
                    zIndex: i === 1 ? 3 : i === 2 ? 2 : 1,
                });
            });

            // Pin section and create fan-out timeline
            const tl = gsap.timeline({
                scrollTrigger: {
                    trigger: section,
                    start: "top top",
                    end: "+=150%",
                    pin: true,
                    scrub: 1,
                    anticipatePin: 1,
                },
            });

            // Heading fades in
            tl.fromTo(
                headingRef.current,
                { opacity: 0, y: 30 },
                { opacity: 1, y: 0, duration: 0.3 }
            );

            // Fan out the cards
            const getFanX = (i: number) => {
                const gap = 380; // px between card centers
                return (i - 1) * gap; // -380, 0, 380
            };

            // All cards fan out simultaneously  
            cardsRef.current.forEach((card, i) => {
                if (!card) return;
                tl.to(
                    card,
                    {
                        x: getFanX(i),
                        rotation: 0,
                        y: 0,
                        scale: 1,
                        duration: 0.6,
                        ease: "power2.out",
                    },
                    0.3 // all start at same time
                );
            });

            // Hold at the end
            tl.to({}, { duration: 0.4 });

        }, sectionRef);

        return () => ctx.revert();
    }, []);

    return (
        <section
            ref={sectionRef}
            className="relative w-full h-screen flex flex-col items-center justify-center overflow-hidden"
            style={{ backgroundColor: "#FAFAF8" }}
        >
            {/* Heading */}
            <div ref={headingRef} className="text-center mb-16 px-4 relative z-10">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary mb-4">
                    Who It&apos;s For
                </p>
                <h2 className="text-4xl md:text-6xl lg:text-7xl font-headline font-bold tracking-tighter text-slate-900">
                    Which one are you?
                </h2>
            </div>

            {/* Card Deck */}
            <div ref={deckRef} className="relative flex items-center justify-center w-full max-w-5xl mx-auto" style={{ height: "360px" }}>
                {personas.map((persona, i) => {
                    const Icon = persona.icon;
                    return (
                        <div
                            key={i}
                            ref={(el) => { cardsRef.current[i] = el; }}
                            className={`absolute w-[300px] md:w-[340px] rounded-[28px] border ${persona.border} bg-white p-8 md:p-10 shadow-xl ${persona.shadow} cursor-default transition-shadow duration-300 hover:shadow-2xl`}
                            style={{ transformOrigin: "center bottom" }}
                        >
                            {/* Gradient accent bar at top */}
                            <div className={`absolute top-0 left-8 right-8 h-1 rounded-b-full bg-gradient-to-r ${persona.gradient}`} />

                            <div className={`w-14 h-14 rounded-2xl ${persona.iconBg} flex items-center justify-center mb-6`}>
                                <Icon className={`w-7 h-7 ${persona.iconColor}`} />
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900 mb-3">
                                {persona.title}
                            </h3>
                            <p className="text-slate-500 leading-relaxed text-base">
                                {persona.description}
                            </p>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
