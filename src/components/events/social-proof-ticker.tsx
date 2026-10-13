'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { CountdownTone } from './event-countdown'

const TONE = {
  dark: {
    shell: 'bg-white/10 border-white/20',
    name: 'text-white/90',
    suffix: 'text-white/65',
  },
  light: {
    shell: 'bg-foreground/[0.055] border-foreground/15',
    name: 'text-foreground',
    suffix: 'text-muted-foreground',
  },
} as const

export function SocialProofTicker({ names, tone = 'dark' }: { names: string[]; tone?: CountdownTone }) {
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

  const t = TONE[tone]

  return (
    <div className={cn(
      'flex items-center gap-2.5 backdrop-blur-md border rounded-full px-4 py-2.5 shadow-md w-fit max-w-xs',
      t.shell,
    )}>
      {/* Live pulse dot */}
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
      </span>
      <span
        className={cn(
          'text-sm transition-all duration-280',
          t.name,
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1',
        )}
      >
        <span className="font-bold">{names[index]}</span>
        <span className={t.suffix}> just registered</span>
      </span>
    </div>
  )
}
