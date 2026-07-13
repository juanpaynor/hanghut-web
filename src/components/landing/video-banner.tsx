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
    <section ref={sectionRef} className="relative w-full overflow-hidden bg-[#FAFAF8] px-4 py-12 md:py-16">
      {/* Ambient brand glows */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute left-1/4 top-8 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-300/40 blur-[100px]" />
        <div className="absolute right-1/4 top-24 h-72 w-72 translate-x-1/2 rounded-full bg-orange-300/40 blur-[100px]" />
        <div className="absolute bottom-8 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-300/30 blur-[110px]" />
      </div>

      <div className="relative mx-auto max-w-5xl">
        {/* Context heading */}
        <div
          className={`mx-auto mb-8 max-w-2xl text-center transition-all duration-700 ${
            revealed ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
          }`}
        >
          <span className="inline-block rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-indigo-600">
            See it in action
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
            This is HangHut
          </h2>
          <p className="mt-3 text-base text-gray-600 md:text-lg">
            From discovering activities near you to selling out your next event — watch how it all comes together.
          </p>
        </div>

        {/* Framed video */}
        <div
          className={`group relative transition-all duration-1000 ease-out ${
            revealed ? "translate-y-0 scale-100 opacity-100" : "translate-y-10 scale-[0.97] opacity-0"
          }`}
        >
          {/* Gradient frame */}
          <div className="rounded-[28px] bg-gradient-to-br from-indigo-500/30 via-transparent to-orange-500/30 p-[1.5px] shadow-2xl">
            <div className="relative overflow-hidden rounded-[26px] bg-black ring-1 ring-black/5">
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
