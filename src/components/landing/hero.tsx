"use client";

import { Button } from "@/components/ui/button";
import { ArrowDown } from "lucide-react";
import dynamic from 'next/dynamic';
import { motion } from "framer-motion";
import { useRef, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { WaitlistDialog } from "./waitlist-dialog";

gsap.registerPlugin(ScrollTrigger);

const PhysicsActivities = dynamic(() => import('./physics-activities'), {
  ssr: false,
  loading: () => <div className="w-full h-full" style={{ backgroundColor: "#FAFAF8" }} />,
});

export default function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const section = containerRef.current;
      const content = contentRef.current;
      const arrow = arrowRef.current;
      if (!section || !content) return;

      // Zoom-through: content scales up and fades out as you scroll
      gsap.to(content, {
        scale: 2.5,
        opacity: 0,
        y: -80,
        ease: "power1.in",
        scrollTrigger: {
          trigger: section,
          start: "5% top",
          end: "60% top",
          scrub: 0.5,
        },
      });

      // Arrow fades out fast
      if (arrow) {
        gsap.to(arrow, {
          opacity: 0,
          y: 30,
          scrollTrigger: {
            trigger: section,
            start: "top top",
            end: "20% top",
            scrub: 1,
          },
        });
      }
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={containerRef} className="relative w-full h-[100dvh] overflow-hidden flex flex-col items-center justify-center" style={{ backgroundColor: "#FAFAF8" }}>
      {/* Background Physics Layer */}
      <div className="absolute inset-0 z-0 opacity-60">
        <PhysicsActivities />
      </div>

      {/* Content Layer — zoom-through target */}
      <div
        ref={contentRef}
        className="relative z-10 container mx-auto px-4 flex flex-col items-center text-center space-y-8"
        style={{ willChange: "transform, opacity" }}
      >
        <div className="space-y-4 perspective-1000 relative z-20">
          <motion.div
            initial={{ scale: 2.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              duration: 0.5,
              ease: [0.34, 1.56, 0.64, 1],
              delay: 0.2
            }}
            className="inline-block bg-primary px-8 py-4 sm:px-12 sm:py-6 rounded-none transform -rotate-1 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]"
          >
            <h1 className="font-headline font-bold text-5xl sm:text-7xl md:text-8xl tracking-tighter text-primary-foreground">
              HANGHUT
            </h1>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.0, duration: 0.8 }}
            className="max-w-xl mx-auto text-xl md:text-2xl text-muted-foreground font-light tracking-wide bg-white/80 backdrop-blur-sm p-4 rounded-xl mt-8"
          >
            REAL CONNECTIONS. UNFORGETTABLE EXPERIENCES.
          </motion.p>
        </div>

        <WaitlistDialog>
          <Button
            size="lg"
            className="rounded-full px-12 py-8 text-xl font-medium shadow-glow hover:scale-105 transition-transform bg-primary text-primary-foreground border-0"
          >
            Find Your Crowd
          </Button>
        </WaitlistDialog>
      </div>

      {/* Scroll Indicator */}
      <div
        ref={arrowRef}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 animate-bounce"
      >
        <ArrowDown className="text-muted-foreground w-6 h-6" />
      </div>

      {/* Gradient Overlay for smooth transition */}
      <div className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none z-10" style={{ background: "linear-gradient(to top, #FAFAF8, transparent)" }} />
    </section>
  );
}
