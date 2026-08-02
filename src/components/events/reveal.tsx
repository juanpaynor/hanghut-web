'use client'

import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

/**
 * Scroll-triggered reveal for event-page body sections. Fades + lifts content
 * into view once as it scrolls up, then leaves it alone. Fully reduced-motion
 * aware — viewers who prefer reduced motion get the content immediately with no
 * transform. Client boundary that wraps server-rendered section children.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
    const reduce = useReducedMotion()
    if (reduce) return <div className={className}>{children}</div>
    return (
        <motion.div
            className={className}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15, margin: '0px 0px -8% 0px' }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
            {children}
        </motion.div>
    )
}
