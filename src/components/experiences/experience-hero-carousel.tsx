'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Play } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ExperienceHeroCarouselProps {
    images: string[]
    videoUrl?: string | null
    title: string
}

export function ExperienceHeroCarousel({ images, videoUrl, title }: ExperienceHeroCarouselProps) {
    const [current, setCurrent] = useState(0)
    const [showVideo, setShowVideo] = useState(false)

    const allMedia = images?.length > 0 ? images : []
    const hasVideo = !!videoUrl
    const hasMultiple = allMedia.length > 1

    const prev = () => setCurrent((c) => (c - 1 + allMedia.length) % allMedia.length)
    const next = () => setCurrent((c) => (c + 1) % allMedia.length)

    if (hasVideo && showVideo) {
        return (
            <div className="relative w-full aspect-[16/9] bg-black rounded-2xl overflow-hidden">
                <video
                    src={videoUrl!}
                    className="w-full h-full object-cover"
                    autoPlay
                    controls
                    playsInline
                />
                <button
                    onClick={() => setShowVideo(false)}
                    className="absolute top-4 right-4 bg-black/60 text-white px-3 py-1 rounded-full text-sm hover:bg-black/80 transition-colors"
                >
                    ✕ Close Video
                </button>
            </div>
        )
    }

    if (allMedia.length === 0) {
        return (
            <div className="relative w-full aspect-[16/9] bg-gradient-to-br from-primary/20 to-secondary/20 rounded-2xl flex items-center justify-center">
                <span className="text-4xl font-bold text-foreground/20">{title}</span>
            </div>
        )
    }

    return (
        <div className="relative group">
            {/* Main Image */}
            <div className="relative w-full aspect-[4/3] md:aspect-[16/9] rounded-2xl overflow-hidden bg-muted">
                <Image
                    src={allMedia[current]}
                    alt={`${title} — image ${current + 1}`}
                    fill
                    sizes="(max-width: 768px) 100vw, 66vw"
                    className="object-cover transition-opacity duration-300"
                    priority={current === 0}
                />

                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />

                {/* Video play button */}
                {hasVideo && current === 0 && (
                    <button
                        onClick={() => setShowVideo(true)}
                        className="absolute inset-0 flex items-center justify-center group/play"
                        aria-label="Play video"
                    >
                        <div className="bg-white/90 text-black rounded-full p-4 shadow-xl opacity-0 group-hover/play:opacity-100 group-hover:opacity-100 transition-all duration-300 scale-90 group-hover/play:scale-100">
                            <Play className="h-6 w-6 fill-black" />
                        </div>
                    </button>
                )}

                {/* Navigation Arrows */}
                {hasMultiple && (
                    <>
                        <button
                            onClick={prev}
                            className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-black rounded-full p-2 shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110"
                            aria-label="Previous image"
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </button>
                        <button
                            onClick={next}
                            className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-black rounded-full p-2 shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110"
                            aria-label="Next image"
                        >
                            <ChevronRight className="h-5 w-5" />
                        </button>
                    </>
                )}

                {/* Dot Indicators */}
                {hasMultiple && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                        {allMedia.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setCurrent(i)}
                                className={cn(
                                    'w-1.5 h-1.5 rounded-full transition-all duration-200',
                                    i === current ? 'bg-white w-4' : 'bg-white/50'
                                )}
                                aria-label={`Go to image ${i + 1}`}
                            />
                        ))}
                    </div>
                )}

                {/* Counter */}
                {hasMultiple && (
                    <div className="absolute top-4 right-4 bg-black/50 text-white text-xs px-2.5 py-1 rounded-full backdrop-blur-sm">
                        {current + 1} / {allMedia.length}
                    </div>
                )}
            </div>

            {/* Thumbnail strip */}
            {allMedia.length > 1 && (
                <div className="flex gap-2 mt-2 overflow-x-auto pb-1 scrollbar-hide">
                    {allMedia.map((src, i) => (
                        <button
                            key={i}
                            onClick={() => setCurrent(i)}
                            className={cn(
                                'relative shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all duration-200',
                                i === current ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-90'
                            )}
                        >
                            <Image src={src} alt={`Thumbnail ${i + 1}`} fill className="object-cover" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
