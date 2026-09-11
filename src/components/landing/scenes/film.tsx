"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { Play, Volume2, VolumeX } from "lucide-react";
import { MaskedLines, Reveal, SceneLabel } from "./primitives";

const VIDEO_SRC =
    "https://api.hanghut.com/storage/v1/object/public/VIDEO-BANNER/HANGHUT_FINAL_(with%20VO)%20(video-converter.com).mp4";

/**
 * Scene 01 — the film. The frame grows slightly as it comes up the viewport, so
 * the video feels like it is being brought forward rather than scrolled past.
 */
export default function Film() {
    const sectionRef = useRef<HTMLElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [muted, setMuted] = useState(true);
    const [playing, setPlaying] = useState(false);
    const reduce = useReducedMotion();

    const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start end", "end start"] });
    const scale = useTransform(scrollYProgress, [0, 0.45, 1], [0.93, 1, 0.97]);
    const glow = useTransform(scrollYProgress, [0, 0.45, 1], [0.05, 0.2, 0.07]);

    // Play only while on screen. A looping video three sections up is bandwidth
    // and battery spent on something nobody is looking at.
    useEffect(() => {
        const el = sectionRef.current;
        const video = videoRef.current;
        if (!el || !video) return;

        const io = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
                } else {
                    video.pause();
                }
            },
            { threshold: 0.25 },
        );
        io.observe(el);
        return () => io.disconnect();
    }, []);

    const toggleSound = () => {
        const v = videoRef.current;
        if (!v) return;
        v.muted = !v.muted;
        setMuted(v.muted);
        if (!v.muted) v.play().then(() => setPlaying(true)).catch(() => {});
    };

    const manualPlay = () => {
        videoRef.current?.play().then(() => setPlaying(true)).catch(() => {});
    };

    return (
        <section ref={sectionRef} className="relative overflow-hidden px-6 py-24 md:px-12 md:py-36">
            <motion.div
                aria-hidden
                style={reduce ? { opacity: 0.14 } : { opacity: glow }}
                className="pointer-events-none absolute left-1/2 top-1/3 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-[var(--lp-brand)] blur-[160px]"
            />

            <div className="relative mx-auto max-w-6xl">
                <Reveal className="mb-12 flex flex-col items-center gap-6 text-center">
                    <SceneLabel index="01" label="The film" />
                    <h2 className="lp-display text-4xl leading-[0.95] text-[var(--lp-text)] md:text-6xl">
                        <MaskedLines lines={["This is HangHut"]} />
                    </h2>
                    <p className="max-w-xl text-balance text-lg leading-relaxed text-[var(--lp-muted)]">
                        From discovering activities near you to selling out your next event — watch how
                        it all comes together.
                    </p>
                </Reveal>

                <motion.div style={reduce ? undefined : { scale }} className="group relative">
                    <div className="rounded-[32px] border border-[var(--lp-line-strong)] bg-[var(--lp-panel)] p-2 shadow-[0_50px_120px_-46px_rgba(79,70,229,0.42)]">
                        <div className="relative overflow-hidden rounded-[26px] bg-black">
                            <video
                                ref={videoRef}
                                src={VIDEO_SRC}
                                muted
                                loop
                                playsInline
                                preload="metadata"
                                className="mx-auto block max-h-[70vh] w-full object-contain"
                            />

                            {!playing && (
                                <button
                                    type="button"
                                    onClick={manualPlay}
                                    aria-label="Play video"
                                    className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors hover:bg-black/45"
                                >
                                    <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--lp-brand)] shadow-[0_0_60px_-6px_rgba(91,76,245,1)] transition-transform group-hover:scale-105">
                                        <Play className="ml-1 h-8 w-8 text-white" fill="currentColor" />
                                    </span>
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={toggleSound}
                                aria-label={muted ? "Unmute video" : "Mute video"}
                                className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full border border-white/15 bg-black/60 px-4 py-2 text-sm font-medium text-white backdrop-blur-md transition-colors hover:bg-black/80"
                            >
                                {muted ? (
                                    <>
                                        <VolumeX className="h-4 w-4" />
                                        <span className="hidden sm:inline">Tap for sound</span>
                                    </>
                                ) : (
                                    <Volume2 className="h-4 w-4" />
                                )}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </section>
    );
}
