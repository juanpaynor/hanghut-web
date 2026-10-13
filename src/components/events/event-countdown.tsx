'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

/**
 * Which ground this sits on.
 *
 * The chrome here is glass: translucent fill, hairline border, and text that
 * has to out-contrast whatever shows through. That only works if it knows the
 * ground. 'dark' is the original styling (white on a cover photo); 'light' is
 * the same construction inverted, for the layouts that put the hero straight
 * onto the page background. Defaulting to 'dark' keeps every existing caller
 * rendering exactly as before.
 */
export type CountdownTone = 'dark' | 'light'

function getTimeLeft(target: string) {
  const diff = new Date(target).getTime() - Date.now()
  if (diff <= 0) return null
  return {
    d: Math.floor(diff / 86_400_000),
    h: Math.floor((diff % 86_400_000) / 3_600_000),
    m: Math.floor((diff % 3_600_000) / 60_000),
    s: Math.floor((diff % 60_000) / 1_000),
  }
}

const TONE = {
  dark: {
    chip: 'bg-white/10 border-white/20',
    digit: 'text-white',
    unit: 'text-white/55',
    label: 'text-white/60',
  },
  light: {
    chip: 'bg-foreground/[0.055] border-foreground/15',
    digit: 'text-foreground',
    unit: 'text-muted-foreground',
    label: 'text-muted-foreground',
  },
} as const

function Unit({ n, label, tone }: { n: number; label: string; tone: CountdownTone }) {
  const t = TONE[tone]
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={cn(
        'relative backdrop-blur-md border rounded-2xl w-[60px] h-[60px] flex items-center justify-center shadow-lg',
        t.chip,
      )}>
        <span className={cn('text-[1.6rem] font-black tabular-nums leading-none', t.digit)}>
          {String(n).padStart(2, '0')}
        </span>
      </div>
      <span className={cn('text-[10px] uppercase tracking-[0.18em] font-semibold', t.unit)}>
        {label}
      </span>
    </div>
  )
}

export function EventCountdown({
  targetDate,
  label = 'Event starts in',
  tone = 'dark',
}: {
  targetDate: string
  label?: string
  tone?: CountdownTone
}) {
  const [timeLeft, setTimeLeft] = useState<ReturnType<typeof getTimeLeft>>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setTimeLeft(getTimeLeft(targetDate))
    const id = setInterval(() => setTimeLeft(getTimeLeft(targetDate)), 1_000)
    return () => clearInterval(id)
  }, [targetDate])

  // Don't render until mounted to avoid hydration mismatch
  if (!mounted || !timeLeft) return null

  return (
    <div className="flex flex-col items-center gap-3">
      <p className={cn('text-[11px] uppercase tracking-[0.22em] font-bold', TONE[tone].label)}>{label}</p>
      <div className="flex items-start gap-3">
        {timeLeft.d > 0 && <Unit n={timeLeft.d} label="days" tone={tone} />}
        <Unit n={timeLeft.h} label="hrs" tone={tone} />
        <Unit n={timeLeft.m} label="min" tone={tone} />
        <Unit n={timeLeft.s} label="sec" tone={tone} />
      </div>
    </div>
  )
}
