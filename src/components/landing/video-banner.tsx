"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, Play } from "lucide-react";

const VIDEO_SRC =
  "https://api.hanghut.com/storage/v1/object/public/VIDEO-BANNER/HANGHUT_FINAL_(with%20VO)%20(video-converter.com).mp4";

export default function VideoBanner() {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [playing, setPlaying] = useState(false);

  // Play while the section is on screen, pause when it scrolls away.
  // Also drives the one-time reveal animation.
  useEffect(() => {
    const el = sectionRef.current;
    const video = videoRef.current;
    if (!el || !video) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
        } else {
          video.pause();
        }
      },
      { threshold: 0.2 }
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  const toggleSound = () => {
    const v = videoRef.current;
    if (!v) return;
    const next = !v.muted;
    v.muted = next;
    setMuted(next);
    if (!next) v.play().then(() => setPlaying(true)).catch(() => {});
  };

  const manualPlay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.play().then(() => setPlaying(true)).catch(() => {});
  };

  return (
    <section ref={sectionRef} className="relative w-full overflow-hidden bg-kinetic-ink px-4 py-20 md:py-28">
      {/* Single brand glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute left-1/2 top-10 h-80 w-[560px] -translate-x-1/2 rounded-full bg-kinetic-brand/10 blur-[130px]" />
      </div>

      <div className="relative mx-auto max-w-5xl">
        {/* Context heading */}
        <div
          className={`mx-auto mb-10 max-w-2xl text-center transition-all duration-700 ${
            revealed ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
          }`}
        >
          <div className="flex items-center justify-center gap-3">
            <span className="h-2 w-2 rounded-full bg-kinetic-brand" />
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-kinetic-brand">See it in action</span>
          </div>
          <h2 className="mt-4 font-headline text-4xl font-bold tracking-tight text-kinetic-text md:text-6xl">
            This is HangHut
          </h2>
          <p className="mt-4 text-lg text-kinetic-muted">
            From discovering activities near you to selling out your next event — watch how it all comes together.
          </p>
        </div>

        {/* Framed video */}
        <div
          className={`group relative transition-all duration-1000 ease-out ${
            revealed ? "translate-y-0 scale-100 opacity-100" : "translate-y-10 scale-[0.97] opacity-0"
          }`}
        >
          {/* Clean brand frame */}
          <div className="rounded-[28px] border border-kinetic-line bg-kinetic-panel p-2 shadow-[0_30px_80px_-30px_rgba(79,70,229,0.35)]">
            <div className="relative overflow-hidden rounded-[22px] bg-black ring-1 ring-black/5">
              <video
                ref={videoRef}
                src={VIDEO_SRC}
                muted
                loop
                playsInline
                preload="metadata"
                className="mx-auto block max-h-[68vh] w-full object-contain"
              />

              {/* Tap-to-play fallback if autoplay was blocked */}
              {!playing && (
                <button
                  type="button"
                  onClick={manualPlay}
                  aria-label="Play video"
                  className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/30"
                >
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform group-hover:scale-105">
                    <Play className="ml-1 h-7 w-7 text-gray-900" fill="currentColor" />
                  </span>
                </button>
              )}

              {/* Sound toggle */}
              <button
                type="button"
                onClick={toggleSound}
                aria-label={muted ? "Unmute video" : "Mute video"}
                className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full bg-black/55 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/75"
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
        </div>
      </div>
    </section>
  );
}
