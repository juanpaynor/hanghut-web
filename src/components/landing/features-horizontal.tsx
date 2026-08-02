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
        description: "Discover and buy tickets to curated events near you — from pop-ups to parties.",
        image: "/features/feature-tickets.png",
    },
    {
        icon: Compass,
        title: "Join Curated Experiences",
        description: "Hand-picked, verified experiences run by local hosts. Just show up and enjoy.",
        image: "/features/feature-experiences.png",
    },
    {
        icon: MapPin,
        title: "Plan a Trip Together",
        description: "Heading somewhere new? Plan your trip and connect with others going too.",
        image: "/features/feature-trips.png",
    },
    {
        icon: Users,
        title: "Create or Join Activities",
        description: "Start your own hangout or join one nearby. Coffee, hiking, gaming — anything.",
        image: "/features/feature-activities.png",
    },
];

export default function FeaturesHorizontal() {
    const sectionRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const headingRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Respect reduced motion — skip pinning/scrub; the track just stacks/scrolls.
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

        const ctx = gsap.context(() => {
            const section = sectionRef.current;
            const track = trackRef.current;
            if (!section || !track) return;

            const totalWidth = track.scrollWidth - window.innerWidth;

            gsap.fromTo(
                headingRef.current,
                { opacity: 0, y: 30 },
                { opacity: 1, y: 0, scrollTrigger: { trigger: section, start: "top 80%", end: "top 40%", scrub: 1 } }
            );

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
        <section ref={sectionRef} className="relative h-screen w-full overflow-hidden bg-kinetic-ink">
            {/* Heading */}
            <div ref={headingRef} className="absolute left-0 right-0 top-16 z-10 px-6 text-center md:px-12">
                <div className="flex items-center justify-center gap-3">
                    <span className="h-2 w-2 rounded-full bg-kinetic-brand" />
                    <span className="font-mono text-xs uppercase tracking-[0.3em] text-kinetic-brand">Go out</span>
                </div>
                <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight text-kinetic-text md:text-5xl">
                    Find your next <span className="text-kinetic-brand">night out</span>
                </h2>
            </div>

            {/* Horizontal track */}
            <div
                ref={trackRef}
                className="absolute left-0 top-0 flex h-full items-center gap-8 px-8 pt-20"
                style={{ width: `${features.length * 85 + 15}vw` }}
            >
                <div className="w-[10vw] shrink-0" />
                {features.map((feature, i) => {
                    const Icon = feature.icon;
                    return (
                        <div
                            key={i}
                            className="group relative flex h-[70vh] w-[80vw] shrink-0 flex-row items-center overflow-hidden rounded-[40px] border border-kinetic-line bg-kinetic-panel p-10 md:w-[70vw] md:p-14 lg:w-[55vw]"
                        >
                            <div className="absolute right-0 top-0 h-64 w-64 -translate-y-1/2 translate-x-1/2 rounded-full bg-kinetic-brand opacity-[0.06] blur-3xl transition-opacity duration-500 group-hover:opacity-[0.12]" />

                            <div className="flex flex-1 flex-col justify-center pr-8">
                                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-kinetic-brand/10">
                                    <Icon className="h-7 w-7 text-kinetic-brand" />
                                </div>
                                <h3 className="mb-4 text-2xl font-bold text-kinetic-text md:text-3xl lg:text-4xl">{feature.title}</h3>
                                <p className="max-w-sm text-base font-light leading-relaxed text-kinetic-muted md:text-lg">{feature.description}</p>
                            </div>

                            <div className="relative hidden h-full flex-1 items-center justify-center md:flex">
                                <div className="relative h-[80%] w-full overflow-hidden rounded-3xl">
                                    <Image src={feature.image} alt={feature.title} fill className="object-contain" />
                                </div>
                            </div>

                            <span className="absolute bottom-6 left-12 font-display text-7xl font-bold text-white/[0.04]">0{i + 1}</span>
                        </div>
                    );
                })}
                <div className="w-[10vw] shrink-0" />
            </div>
        </section>
    );
}
