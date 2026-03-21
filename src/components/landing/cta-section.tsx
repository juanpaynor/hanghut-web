"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { WaitlistDialog } from "./waitlist-dialog";
import Link from "next/link";

gsap.registerPlugin(ScrollTrigger);

export default function CTASection() {
    const sectionRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const bgRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const ctx = gsap.context(() => {
            const section = sectionRef.current;
            if (!section) return;

            // Background color transition
            gsap.fromTo(
                bgRef.current,
                { opacity: 0 },
                {
                    opacity: 1,
                    scrollTrigger: {
                        trigger: section,
                        start: "top 80%",
                        end: "top 20%",
                        scrub: 1,
                    },
                }
            );

            // Content entrance
            gsap.fromTo(
                contentRef.current,
                { opacity: 0, y: 60, scale: 0.95 },
                {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    duration: 1,
                    scrollTrigger: {
                        trigger: section,
                        start: "top 60%",
                        end: "top 20%",
                        scrub: 1,
                    },
                }
            );
        }, sectionRef);

        return () => ctx.revert();
    }, []);

    return (
        <section
            ref={sectionRef}
            className="relative w-full min-h-screen flex items-center justify-center overflow-hidden"
            style={{ backgroundColor: "#FAFAF8" }}
        >
            {/* Animated background layer */}
            <div
                ref={bgRef}
                className="absolute inset-0 bg-primary opacity-0"
            />

            {/* Decorative blobs */}
            <div className="absolute top-10 left-10 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-10 right-10 w-96 h-96 bg-white/5 rounded-full blur-3xl pointer-events-none" />

            {/* Content */}
            <div ref={contentRef} className="relative z-10 text-center px-6 max-w-3xl mx-auto space-y-10">
                <h2 className="text-5xl md:text-7xl lg:text-8xl font-headline font-bold tracking-tighter text-white leading-[0.95]">
                    Ready to find{" "}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-orange-300">
                        your crowd?
                    </span>
                </h2>

                <p className="text-xl md:text-2xl text-white/80 font-light max-w-xl mx-auto leading-relaxed">
                    Less scrolling. More living. Join the community that brings people together IRL.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <WaitlistDialog>
                        <Button
                            size="lg"
                            className="rounded-full px-10 py-7 text-lg font-bold bg-white text-primary hover:bg-white/90 shadow-2xl shadow-black/20 hover:scale-105 transition-all"
                        >
                            Join the Waitlist
                            <ArrowRight className="ml-2 h-5 w-5" />
                        </Button>
                    </WaitlistDialog>
                </div>
            </div>
        </section>
    );
}
