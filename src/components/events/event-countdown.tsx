'use client'

import { useState, useEffect } from 'react'

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

function Unit({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl w-[60px] h-[60px] flex items-center justify-center shadow-lg">
        <span className="text-[1.6rem] font-black text-white tabular-nums leading-none">
          {String(n).padStart(2, '0')}
        </span>
      </div>
      <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-white/55">
        {label}
      </span>
    </div>
  )
}

export function EventCountdown({
  targetDate,
  label = 'Event starts in',
}: {
  targetDate: string
  label?: string
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
      <p className="text-[11px] text-white/60 uppercase tracking-[0.22em] font-bold">{label}</p>
      <div className="flex items-start gap-3">
        {timeLeft.d > 0 && <Unit n={timeLeft.d} label="days" />}
        <Unit n={timeLeft.h} label="hrs" />
        <Unit n={timeLeft.m} label="min" />
        <Unit n={timeLeft.s} label="sec" />
      </div>
    </div>
  )
}
