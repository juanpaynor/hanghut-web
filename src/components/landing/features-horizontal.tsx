"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Ticket, Compass, MapPin, Users } from "lucide-react";
import Image from "next/image";

gsap.registerPlugin(ScrollTrigger);

const features = [
    {
        icon: Ticket,
        title: "Buy Event Tickets",
        description: "Discover and buy tickets to curated events happening near you — from pop-ups to parties.",
        gradient: "from-orange-500 to-orange-700",
        bg: "bg-orange-50",
        iconColor: "text-orange-600",
        image: "/features/feature-tickets.png",
    },
    {
        icon: Compass,
        title: "Join Curated Experiences",
        description: "Hand-picked, verified experiences run by local hosts. No guesswork — just show up and enjoy.",
        gradient: "from-indigo-500 to-indigo-700",
        bg: "bg-indigo-50",
        iconColor: "text-indigo-600",
        image: "/features/feature-experiences.png",
    },
    {
        icon: MapPin,
        title: "Plan a Trip Together",
        description: "Heading somewhere new? Plan your trip and connect with others going to the same place.",
        gradient: "from-emerald-500 to-emerald-700",
        bg: "bg-emerald-50",
        iconColor: "text-emerald-600",
        image: "/features/feature-trips.png",
    },
    {
        icon: Users,
        title: "Create or Join Activities",
        description: "Start your own hangout or join one nearby. Coffee, hiking, gaming — whatever you're into.",
        gradient: "from-purple-500 to-purple-700",
        bg: "bg-purple-50",
        iconColor: "text-purple-600",
        image: "/features/feature-activities.png",
    },
];

export default function FeaturesHorizontal() {
    const sectionRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const headingRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const ctx = gsap.context(() => {
            const section = sectionRef.current;
            const track = trackRef.current;
            if (!section || !track) return;

            // Calculate scroll distance
            const totalWidth = track.scrollWidth - window.innerWidth;

            // Heading entrance
            gsap.fromTo(
                headingRef.current,
                { opacity: 0, y: 30 },
                {
                    opacity: 1,
                    y: 0,
                    scrollTrigger: {
                        trigger: section,
                        start: "top 80%",
                        end: "top 40%",
                        scrub: 1,
                    },
                }
            );

            // Horizontal scroll
            gsap.to(track, {
                x: -totalWidth,
                ease: "none",
                scrollTrigger: {
                    trigger: section,
                    start: "top top",
                    end: `+=${totalWidth}`,
                    pin: true,
                    scrub: 1,
                    anticipatePin: 1,
                },
            });
        }, sectionRef);

        return () => ctx.revert();
    }, []);

    return (
        <section
            ref={sectionRef}
            className="relative w-full h-screen overflow-hidden"
            style={{ backgroundColor: "#FAFAF8" }}
        >
            {/* Heading - fixed at top */}
            <div ref={headingRef} className="absolute top-16 left-0 right-0 z-10 text-center px-4">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary mb-3">
                    Features
                </p>
                <h2 className="text-4xl md:text-5xl font-headline font-bold tracking-tighter text-slate-900">
                    Everything you need
                </h2>
            </div>

            {/* Horizontal Track */}
            <div
                ref={trackRef}
                className="absolute top-0 left-0 h-full flex items-center gap-8 px-8 pt-20"
                style={{ width: `${features.length * 85 + 15}vw` }}
            >
                {/* Spacer for heading */}
                <div className="shrink-0 w-[10vw]" />

                {features.map((feature, i) => {
                    const Icon = feature.icon;
                    return (
                        <div
                            key={i}
                            className="shrink-0 w-[80vw] md:w-[70vw] lg:w-[55vw] h-[70vh] rounded-[40px] border border-slate-200/80 shadow-sm flex flex-row items-center p-10 md:p-14 relative overflow-hidden group hover:shadow-xl transition-shadow duration-500"
                            style={{ backgroundColor: "#FFFFFF" }}
                        >
                            {/* Subtle gradient accent */}
                            <div className={`absolute top-0 right-0 w-64 h-64 bg-gradient-to-br ${feature.gradient} opacity-[0.04] rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:opacity-[0.08] transition-opacity duration-500`} />

                            {/* Text side */}
                            <div className="flex-1 flex flex-col justify-center pr-8">
                                <div className={`w-14 h-14 rounded-2xl ${feature.bg} flex items-center justify-center mb-6`}>
                                    <Icon className={`w-7 h-7 ${feature.iconColor}`} />
                                </div>
                                <h3 className="text-2xl md:text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
                                    {feature.title}
                                </h3>
                                <p className="text-base md:text-lg text-slate-500 font-light leading-relaxed max-w-sm">
                                    {feature.description}
                                </p>
                            </div>

                            {/* Image side */}
                            <div className="hidden md:flex flex-1 items-center justify-center relative h-full">
                                <div className="relative w-full h-[80%] rounded-3xl overflow-hidden">
                                    <Image
                                        src={feature.image}
                                        alt={feature.title}
                                        fill
                                        className="object-contain"
                                    />
                                </div>
                            </div>

                            {/* Card number */}
                            <span className="absolute bottom-6 left-12 text-7xl font-bold text-slate-100/80 font-headline">
                                0{i + 1}
                            </span>
                        </div>
                    );
                })}

                {/* Trailing spacer */}
                <div className="shrink-0 w-[10vw]" />
            </div>
        </section>
    );
}
