'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Grip, ZoomIn } from 'lucide-react'
import { Slider } from '@/components/ui/slider'

interface DraggableVideoCropperProps {
    videoUrl: string
    value: string // Expects format: "scale:1.0|x:50|y:50" or legacy "center 50%"
    onChange: (value: string) => void
}

export function DraggableVideoCropper({ videoUrl, value, onChange }: DraggableVideoCropperProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [xPercent, setXPercent] = useState(50)
    const [yPercent, setYPercent] = useState(50)
    const [scale, setScale] = useState(1.0)

    // Drag state for calculations
    const [startX, setStartX] = useState(50)
    const [startY, setStartY] = useState(50)
    const [isDragging, setIsDragging] = useState(false)

    // Parse incoming value
    useEffect(() => {
        if (!isDragging) {
            if (value && value.includes('scale:')) {
                // New Format: scale:1.5|x:40|y:60
                const parts = value.split('|')
                let newS = 1.0, newX = 50, newY = 50
                parts.forEach(p => {
                    const [k, v] = p.split(':')
                    if (k === 'scale') newS = parseFloat(v)
                    if (k === 'x') newX = parseFloat(v)
                    if (k === 'y') newY = parseFloat(v)
                })
                setScale(newS)
                setXPercent(newX)
                setYPercent(newY)
            } else if (value && value.includes('%')) {
                // Legacy Format: "center 50%" or "50% 50%"
                const parts = value.split(' ')
                const pY = parts.length === 2 ? parseFloat(parts[1]) : 50
                const pX = parts.length === 2 && parts[0].includes('%') ? parseFloat(parts[0]) : 50
                if (!isNaN(pY)) setYPercent(pY)
                if (!isNaN(pX)) setXPercent(pX)
                setScale(1.0)
            } else if (value === 'top') { setYPercent(0); setXPercent(50); setScale(1.0) }
            else if (value === 'bottom') { setYPercent(100); setXPercent(50); setScale(1.0) }
            else { setXPercent(50); setYPercent(50); setScale(1.0) }
        }
    }, [value, isDragging])

    // Fire onChange whenever values change significantly and not dragging
    const emitChange = (s: number, x: number, y: number) => {
        onChange(`scale:${s.toFixed(2)}|x:${Math.round(x)}|y:${Math.round(y)}`)
    }

    const handleZoomChange = (vals: number[]) => {
        const newScale = vals[0]
        setScale(newScale)

        // If zooming all the way out, naturally re-center
        if (newScale === 1.0) {
            setXPercent(50)
            setYPercent(50)
            emitChange(1.0, 50, 50)
        } else {
            emitChange(newScale, xPercent, yPercent)
        }
    }

    const handleDragStart = () => {
        setIsDragging(true)
        setStartX(xPercent)
        setStartY(yPercent)
    }

    const handleDrag = (e: any, info: any) => {
        if (!containerRef.current) return

        const rect = containerRef.current.getBoundingClientRect()
        const height = rect.height
        const width = rect.width

        // When scaled up, a full drag across the container should represent moving the focal point.
        // We multiply the offset percentage so dragging feels responsive regardless of zoom.
        // E.g., at 2x zoom, you only see 50% of the image. Moving mouse 100% of container width should move the focal point drastically.
        // Dividing delta by scale makes the drag 1:1 with the mouse pointer visually.

        const deltaXPct = -(info.offset.x / width) * 100 / scale
        const deltaYPct = -(info.offset.y / height) * 100 / scale

        const nextX = Math.max(0, Math.min(100, startX + deltaXPct))
        const nextY = Math.max(0, Math.min(100, startY + deltaYPct))

        setXPercent(nextX)
        setYPercent(nextY)

        onChange(`scale:${scale.toFixed(2)}|x:${Math.round(nextX)}|y:${Math.round(nextY)}`)
    }

    const handleDragEnd = () => {
        setIsDragging(false)
        emitChange(scale, xPercent, yPercent)
    }

    return (
        <div className="space-y-4">

            <div
                ref={containerRef}
                className="relative w-full aspect-video md:aspect-[21/9] bg-muted rounded-xl overflow-hidden border group shadow-inner block"
                style={{ touchAction: 'none' }}
            >
                {/* 
                    Motion div allows multidirectional pan.
                    We conditionally allow horizontal drag if zoomed in.
                */}
                <motion.div
                    drag={scale > 1.0 ? true : "y"}
                    dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
                    dragElastic={0}
                    dragMomentum={false}
                    onDragStart={handleDragStart}
                    onDrag={handleDrag}
                    onDragEnd={handleDragEnd}
                    className="absolute inset-0 w-full h-full z-10 cursor-grab active:cursor-grabbing"
                />

                <video
                    src={videoUrl}
                    className="w-full h-full object-cover pointer-events-none select-none transition-transform duration-75 origin-center"
                    style={{
                        objectPosition: `${xPercent}% ${yPercent}%`,
                        transform: `scale(${scale})`
                    }}
                    muted
                    loop
                    autoPlay
                    playsInline
                />

                {/* Drag Indicator Overlay */}
                <div className={`absolute inset-0 bg-black/20 flex flex-col items-center justify-center pointer-events-none transition-opacity duration-300 ${isDragging ? 'opacity-0' : 'opacity-100 group-hover:opacity-100'}`}>
                    <div className="bg-background/80 backdrop-blur-md rounded-full px-4 py-2 flex items-center gap-2 shadow-lg text-sm font-medium">
                        <Grip className="h-4 w-4" />
                        Pan to Position
                    </div>
                </div>

                {/* Reference Grid */}
                <div className="absolute inset-0 pointer-events-none border border-white/20">
                    <div className="absolute top-1/3 left-0 w-full border-t border-white/20 border-dashed" />
                    <div className="absolute top-2/3 left-0 w-full border-t border-white/20 border-dashed" />
                    <div className="absolute top-0 left-1/3 h-full border-l border-white/20 border-dashed" />
                    <div className="absolute top-0 left-2/3 h-full border-l border-white/20 border-dashed" />
                </div>
            </div>

            {/* Slider Controls */}
            <div className="flex items-center gap-4 bg-muted/50 p-3 rounded-lg border">
                <ZoomIn className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1 font-medium">
                        <span>Zoom Level</span>
                        <span className="font-mono">{scale.toFixed(1)}x</span>
                    </div>
                    <Slider
                        min={1.0}
                        max={3.0}
                        step={0.1}
                        value={[scale]}
                        onValueChange={handleZoomChange}
                        className="w-full"
                    />
                </div>
            </div>

            <p className="text-xs text-muted-foreground text-center">Zoom in and drag to focus on the best part of your video.</p>
        </div>
    )
}
