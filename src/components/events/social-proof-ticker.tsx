'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

export function SocialProofTicker({ names }: { names: string[] }) {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (names.length <= 1) return
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIndex(i => (i + 1) % names.length)
        setVisible(true)
      }, 280)
    }, 3_800)
    return () => clearInterval(interval)
  }, [names.length])

  if (!names.length) return null

  return (
    <div className="flex items-center gap-2.5 bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-4 py-2.5 shadow-md w-fit max-w-xs">
      {/* Live pulse dot */}
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
      </span>
      <span
        className={cn(
          'text-sm text-white/90 transition-all duration-280',
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1',
        )}
      >
        <span className="font-bold">{names[index]}</span>
        <span className="text-white/65"> just registered</span>
      </span>
    </div>
  )
}
