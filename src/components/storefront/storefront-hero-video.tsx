'use client'

import { useState, useRef, useEffect } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getYouTubeEmbedUrl } from '@/lib/utils'

interface StorefrontHeroVideoProps {
    videoUrl: string
    videoPosition?: string
}

export function StorefrontHeroVideo({ videoUrl, videoPosition = 'center' }: StorefrontHeroVideoProps) {
    const [isMuted, setIsMuted] = useState(true)
    const videoRef = useRef<HTMLVideoElement>(null)
    const iframeRef = useRef<HTMLIFrameElement>(null)

    // Determine type
    const showYoutube = !!getYouTubeEmbedUrl(videoUrl)
    let youtubeUrl = getYouTubeEmbedUrl(videoUrl)
    // Adjust YouTube URL for initial mute state
    if (youtubeUrl) {
        youtubeUrl = youtubeUrl.replace('mute=1', `mute=${isMuted ? 1 : 0}`)
    }

    const toggleMute = () => {
        const newMuted = !isMuted
        setIsMuted(newMuted)

        if (showYoutube) {
            // Send postMessage to YouTube Iframe
            if (iframeRef.current && iframeRef.current.contentWindow) {
                const func = newMuted ? 'mute' : 'unMute'
                iframeRef.current.contentWindow.postMessage(JSON.stringify({
                    'event': 'command',
                    'func': func,
                    'args': []
                }), '*')
            }
        } else {
            // Native Video
            if (videoRef.current) {
                videoRef.current.muted = newMuted
            }
        }
    }

    // Parse the new scale/x/y format
    let objectPosition = 'center 50%'
    let transform = 'none'

    if (videoPosition.includes('scale:')) {
        const parts = videoPosition.split('|')
        let s = 1.0, x = 50, y = 50
        parts.forEach((p: string) => {
            const [k, v] = p.split(':')
            if (k === 'scale') s = parseFloat(v)
            if (k === 'x') x = parseFloat(v)
            if (k === 'y') y = parseFloat(v)
        })
        objectPosition = `${x}% ${y}%`
        transform = `scale(${s})`
    } else if (videoPosition.includes('%')) {
        objectPosition = videoPosition // legacy
    } else if (videoPosition === 'top') {
        objectPosition = 'center 0%'
    } else if (videoPosition === 'bottom') {
        objectPosition = 'center 100%'
    }

    return (
        <div className="relative w-full h-full group/video overflow-hidden">
            {showYoutube ? (
                <iframe
                    ref={iframeRef}
                    src={youtubeUrl!}
                    className="w-full h-full object-cover pointer-events-none origin-center"
                    style={{ objectPosition, transform }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                />
            ) : (
                <video
                    ref={videoRef}
                    src={videoUrl}
                    autoPlay
                    muted={isMuted}
                    loop
                    playsInline
                    className="w-full h-full object-cover"
                    style={{ objectPosition: videoPosition }}
                />
            )}

            {/* Mute Toggle Button */}
            <div className="absolute bottom-4 right-4 z-50 transition-opacity duration-300">
                <Button
                    variant="secondary"
                    size="icon"
                    className="h-10 w-10 rounded-full bg-black/50 hover:bg-black/70 text-white border-none shadow-lg backdrop-blur-sm"
                    onClick={toggleMute}
                >
                    {isMuted ? (
                        <VolumeX className="h-5 w-5" />
                    ) : (
                        <Volume2 className="h-5 w-5" />
                    )}
                </Button>
            </div>
        </div>
    )
}
