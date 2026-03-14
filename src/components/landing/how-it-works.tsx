"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { MapPin, UserCheck, PartyPopper } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const steps = [
    {
        icon: MapPin,
        title: "Find an Activity",
        description: "Browse the map for activities near you — from coffee runs to concerts.",
        color: "bg-indigo-100 text-indigo-600",
    },
    {
        icon: UserCheck,
        title: "Join the Hangout",
        description: "Request to join. The host reviews and approves you into the crew.",
        color: "bg-orange-100 text-orange-600",
    },
    {
        icon: PartyPopper,
        title: "Meet Your Crew",
        description: "Show up. Have fun. Leave with a good story — and people you didn't know you needed.",
        color: "bg-emerald-100 text-emerald-600",
    },
];

export default function HowItWorks() {
    const sectionRef = useRef<HTMLDivElement>(null);
    const stepsRef = useRef<(HTMLDivElement | null)[]>([]);
    const progressRef = useRef<HTMLDivElement>(null);
    const headingRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const ctx = gsap.context(() => {
            const section = sectionRef.current;
            if (!section) return;

            // Pin the section
            const tl = gsap.timeline({
                scrollTrigger: {
                    trigger: section,
                    start: "top top",
                    end: "+=200%",
                    pin: true,
                    scrub: 1,
                    anticipatePin: 1,
                },
            });

            // Heading fades in
            tl.fromTo(
                headingRef.current,
                { opacity: 0, y: 40 },
                { opacity: 1, y: 0, duration: 0.3 }
            );

            // Animate each step sequentially
            stepsRef.current.forEach((step, i) => {
                if (!step) return;

                // Fade in
                tl.fromTo(
                    step,
                    { opacity: 0, y: 60, scale: 0.95 },
                    { opacity: 1, y: 0, scale: 1, duration: 0.4 },
                    i === 0 ? "+=0.1" : "+=0.15"
                );

                // Update progress bar
                tl.to(
                    progressRef.current,
                    { width: `${((i + 1) / steps.length) * 100}%`, duration: 0.3 },
                    "<"
                );

                // Hold visible
                tl.to(step, { duration: 0.3 });

                // Fade out (except last step)
                if (i < steps.length - 1) {
                    tl.to(step, {
                        opacity: 0,
                        y: -30,
                        scale: 0.95,
                        duration: 0.3,
                    });
                }
            });

            // Hold the last step
            tl.to({}, { duration: 0.3 });
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
            <div ref={headingRef} className="text-center mb-16 px-4">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary mb-4">
                    How It Works
                </p>
                <h2 className="text-4xl md:text-6xl lg:text-7xl font-headline font-bold tracking-tighter text-slate-900">
                    As easy as{" "}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-500">
                        1, 2, 3
                    </span>
                </h2>
            </div>

            {/* Steps Container */}
            <div className="relative w-full max-w-lg mx-auto px-6 h-[280px] flex items-center justify-center">
                {steps.map((step, i) => {
                    const Icon = step.icon;
                    return (
                        <div
                            key={i}
                            ref={(el) => { stepsRef.current[i] = el; }}
                            className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 opacity-0"
                        >
                            <div className={`w-20 h-20 rounded-3xl ${step.color} flex items-center justify-center mb-8 shadow-lg`}>
                                <Icon className="w-10 h-10" />
                            </div>
                            <h3 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                                {step.title}
                            </h3>
                            <p className="text-lg text-slate-500 font-light max-w-md leading-relaxed">
                                {step.description}
                            </p>
                        </div>
                    );
                })}
            </div>

            {/* Progress Bar */}
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-48">
                <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                    <div
                        ref={progressRef}
                        className="h-full bg-primary rounded-full"
                        style={{ width: "0%" }}
                    />
                </div>
                <div className="flex justify-between mt-3 text-xs font-medium text-slate-400">
                    {steps.map((_, i) => (
                        <span key={i}>{i + 1}</span>
                    ))}
                </div>
            </div>
        </section>
    );
}
