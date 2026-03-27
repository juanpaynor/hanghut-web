'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, X, Expand } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ExperienceHeroCarouselProps {
    images: string[]
    videoUrl?: string | null
    title: string
    locationName?: string | null
}

export function ExperienceHeroCarousel({ images, videoUrl, title, locationName }: ExperienceHeroCarouselProps) {
    const [current, setCurrent] = useState(0)
    const [fullscreen, setFullscreen] = useState(false)
    const [paused, setPaused] = useState(false)

    const allMedia = images?.length > 0 ? images : []
    const hasMultiple = allMedia.length > 1

    // Auto-rotate every 5 seconds
    useEffect(() => {
        if (!hasMultiple || paused || fullscreen) return
        const timer = setInterval(() => {
            setCurrent((c) => (c + 1) % allMedia.length)
        }, 5000)
        return () => clearInterval(timer)
    }, [hasMultiple, paused, fullscreen, allMedia.length])

    const prev = () => { setCurrent((c) => (c - 1 + allMedia.length) % allMedia.length); setPaused(true) }
    const next = () => { setCurrent((c) => (c + 1) % allMedia.length); setPaused(true) }

    // Fullscreen lightbox
    if (fullscreen) {
        return (
            <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
                <button onClick={() => setFullscreen(false)} className="absolute top-4 right-4 z-10 bg-white/10 hover:bg-white/20 text-white rounded-full p-2.5 transition-colors">
                    <X className="h-5 w-5" />
                </button>
                {hasMultiple && (
                    <div className="absolute top-4 left-4 z-10 bg-black/50 text-white text-sm px-3 py-1.5 rounded-full backdrop-blur-sm">
                        {current + 1} / {allMedia.length}
                    </div>
                )}
                <img src={allMedia[current]} alt={`${title} — ${current + 1}`} className="max-w-full max-h-full object-contain" />
                {hasMultiple && (
                    <>
                        <button onClick={prev} className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded-full p-3 transition-colors"><ChevronLeft className="h-6 w-6" /></button>
                        <button onClick={next} className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded-full p-3 transition-colors"><ChevronRight className="h-6 w-6" /></button>
                    </>
                )}
                {hasMultiple && (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 bg-black/40 backdrop-blur-sm rounded-xl px-3 py-2">
                        {allMedia.map((src, i) => (
                            <button key={i} onClick={() => setCurrent(i)} className={cn('relative shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all duration-200', i === current ? 'border-white scale-110' : 'border-transparent opacity-50 hover:opacity-80')}>
                                <img src={src} alt="" className="w-full h-full object-cover" />
                            </button>
                        ))}
                    </div>
                )}
            </div>
        )
    }

    if (allMedia.length === 0) {
        return (
            <div className="relative w-full h-[420px] bg-gradient-to-br from-primary/20 to-secondary/20 rounded-2xl flex items-center justify-center">
                <span className="text-4xl font-bold text-foreground/20">{title}</span>
            </div>
        )
    }

    return (
        <div
            className="relative w-full h-[420px] md:h-[480px] rounded-2xl overflow-hidden group cursor-pointer"
            onClick={() => setFullscreen(true)}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            {/* Images */}
            {allMedia.map((src, i) => (
                <img
                    key={i}
                    src={src}
                    alt={`${title} — ${i + 1}`}
                    className={cn(
                        'absolute inset-0 w-full h-full object-cover transition-opacity duration-700',
                        i === current ? 'opacity-100' : 'opacity-0'
                    )}
                />
            ))}

            {/* Dark gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

            {/* Title + Location overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8 z-10">
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-white leading-tight drop-shadow-lg">
                    {title}
                </h1>
                {locationName && (
                    <p className="text-white/80 text-sm md:text-base mt-2 flex items-center gap-1.5">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        {locationName}
                    </p>
                )}
            </div>

            {/* Nav arrows */}
            {hasMultiple && (
                <>
                    <button onClick={(e) => { e.stopPropagation(); prev() }} className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 text-white rounded-full p-2 backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100">
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); next() }} className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 text-white rounded-full p-2 backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100">
                        <ChevronRight className="h-5 w-5" />
                    </button>
                </>
            )}

            {/* Dot indicators */}
            {hasMultiple && (
                <div className="absolute bottom-3 right-6 md:right-8 flex gap-1.5 z-10">
                    {allMedia.map((_, i) => (
                        <button
                            key={i}
                            onClick={(e) => { e.stopPropagation(); setCurrent(i); setPaused(true) }}
                            className={cn('w-2 h-2 rounded-full transition-all duration-300', i === current ? 'bg-white w-5' : 'bg-white/40 hover:bg-white/60')}
                        />
                    ))}
                </div>
            )}

            {/* Expand button */}
            <button
                onClick={(e) => { e.stopPropagation(); setFullscreen(true) }}
                className="absolute top-4 right-4 bg-black/40 hover:bg-black/60 text-white rounded-lg px-3 py-1.5 text-xs font-medium backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 flex items-center gap-1.5"
            >
                <Expand className="h-3.5 w-3.5" />
                Show all photos
            </button>
        </div>
    )
}
