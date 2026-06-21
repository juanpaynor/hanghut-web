"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowLeft, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

const floatingItems = [
    { emoji: "🎶", x: "10%", y: "20%", delay: 0 },
    { emoji: "🎪", x: "80%", y: "15%", delay: 0.4 },
    { emoji: "🎟️", x: "70%", y: "70%", delay: 0.8 },
    { emoji: "🍻", x: "15%", y: "75%", delay: 1.2 },
    { emoji: "🎤", x: "85%", y: "50%", delay: 0.6 },
    { emoji: "🎭", x: "5%", y: "50%", delay: 1.0 },
    { emoji: "✨", x: "50%", y: "10%", delay: 0.3 },
    { emoji: "🥳", x: "40%", y: "85%", delay: 0.9 },
];

export default function NotFound() {
    return (
        <div
            className="relative min-h-dvh flex flex-col items-center justify-center overflow-hidden font-sans"
            style={{ backgroundColor: "#FAFAF8" }}
        >
            {/* Floating ambient emojis */}
            {floatingItems.map((item, i) => (
                <motion.div
                    key={i}
                    className="absolute text-3xl md:text-4xl select-none pointer-events-none"
                    style={{ left: item.x, top: item.y }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{
                        opacity: [0, 0.35, 0.35, 0],
                        y: [20, 0, -10, -30],
                    }}
                    transition={{
                        duration: 6,
                        delay: item.delay,
                        repeat: Infinity,
                        repeatDelay: 3,
                        ease: "easeInOut",
                    }}
                >
                    {item.emoji}
                </motion.div>
            ))}

            {/* Soft gradient blobs */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-400/5 rounded-full blur-3xl pointer-events-none" />

            {/* Content */}
            <div className="relative z-10 flex flex-col items-center text-center px-6 space-y-8 max-w-lg">
                {/* Logo */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
                >
                    <Link href="/">
                        <Image
                            src="/logo_transparent.png"
                            alt="HangHut"
                            width={56}
                            height={56}
                            className="h-14 w-auto object-contain"
                        />
                    </Link>
                </motion.div>

                {/* 404 number */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.1 }}
                    className="space-y-2"
                >
                    <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary">
                        404
                    </p>
                    <h1 className="text-6xl md:text-8xl font-headline font-black tracking-tighter text-slate-900 leading-none">
                        Lost the<br />vibe?
                    </h1>
                </motion.div>

                {/* Subtext */}
                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.25 }}
                    className="text-lg text-slate-500 font-light leading-relaxed"
                >
                    This page doesn&apos;t exist — but there&apos;s plenty happening nearby.
                    Head back and find your next hangout.
                </motion.p>

                {/* CTAs */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.4 }}
                    className="flex flex-col sm:flex-row gap-3 w-full justify-center"
                >
                    <Link href="/">
                        <Button
                            size="lg"
                            className="rounded-full px-8 gap-2 w-full sm:w-auto transition-all hover:scale-105"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to Home
                        </Button>
                    </Link>
                    <Link href="/events">
                        <Button
                            size="lg"
                            variant="outline"
                            className="rounded-full px-8 gap-2 w-full sm:w-auto transition-all hover:scale-105"
                        >
                            <Compass className="w-4 h-4" />
                            Explore Events
                        </Button>
                    </Link>
                </motion.div>
            </div>
        </div>
    );
}
