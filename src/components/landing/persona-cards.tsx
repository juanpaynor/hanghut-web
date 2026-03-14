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

    useEffect(() => {
        const mobile = window.innerWidth < 768;

        const ctx = gsap.context(() => {
            const section = sectionRef.current;
            if (!section) return;

            if (mobile) {
                // MOBILE: Simple stagger entrance, no pinning
                gsap.fromTo(
                    headingRef.current,
                    { opacity: 0, y: 30 },
                    {
                        opacity: 1, y: 0,
                        scrollTrigger: { trigger: section, start: "top 80%", end: "top 50%", scrub: 1 },
                    }
                );

                cardsRef.current.forEach((card) => {
                    if (!card) return;
                    gsap.fromTo(
                        card,
                        { opacity: 0, y: 50, scale: 0.95 },
                        {
                            opacity: 1, y: 0, scale: 1,
                            scrollTrigger: { trigger: card, start: "top 90%", end: "top 60%", scrub: 1 },
                        }
                    );
                });
            } else {
                // DESKTOP: Stacked deck fan-out with pinning
                const stackRotations = [-6, 0, 6];
                const stackOffsets = [-8, 0, 8];

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

                tl.fromTo(
                    headingRef.current,
                    { opacity: 0, y: 30 },
                    { opacity: 1, y: 0, duration: 0.3 }
                );

                const gap = 380;
                cardsRef.current.forEach((card, i) => {
                    if (!card) return;
                    tl.to(card, {
                        x: (i - 1) * gap,
                        rotation: 0,
                        y: 0,
                        scale: 1,
                        duration: 0.6,
                        ease: "power2.out",
                    }, 0.3);
                });

                tl.to({}, { duration: 0.4 });
            }
        }, sectionRef);

        return () => ctx.revert();
    }, []);

    const isMobileSSR = typeof window !== "undefined" && window.innerWidth < 768;

    return (
        <section
            ref={sectionRef}
            className="relative w-full overflow-hidden"
            style={{ backgroundColor: "#FAFAF8" }}
        >
            <div className={isMobileSSR ? "py-24 px-6" : "h-screen flex flex-col items-center justify-center"}>
                {/* Heading */}
                <div ref={headingRef} className="text-center mb-12 md:mb-16 px-4 relative z-10">
                    <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary mb-4">
                        Who It&apos;s For
                    </p>
                    <h2 className="text-4xl md:text-6xl lg:text-7xl font-headline font-bold tracking-tighter text-slate-900">
                        Which one are you?
                    </h2>
                </div>

                {/* Cards — vertical on mobile, absolute-positioned deck on desktop */}
                <div className={isMobileSSR
                    ? "space-y-6 max-w-sm mx-auto"
                    : "relative flex items-center justify-center w-full max-w-5xl mx-auto"
                } style={isMobileSSR ? {} : { height: "360px" }}>
                    {personas.map((persona, i) => {
                        const Icon = persona.icon;
                        return (
                            <div
                                key={i}
                                ref={(el) => { cardsRef.current[i] = el; }}
                                className={`${!isMobileSSR ? "absolute" : ""} w-full ${!isMobileSSR ? "w-[340px]" : "max-w-sm"} rounded-[28px] border ${persona.border} bg-white p-8 md:p-10 shadow-xl ${persona.shadow} cursor-default transition-shadow duration-300 hover:shadow-2xl`}
                                style={!isMobileSSR ? { transformOrigin: "center bottom" } : {}}
                            >
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
            </div>
        </section>
    );
}
