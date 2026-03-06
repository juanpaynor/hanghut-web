import { useState, useCallback } from 'react'

interface RateLimitState {
    attempts: number
    lockedUntil: number | null
}

export function useLoginRateLimit(maxAttempts = 5, lockoutDuration = 60000) {
    const [state, setState] = useState<RateLimitState>({
        attempts: 0,
        lockedUntil: null,
    })

    const recordAttempt = useCallback(() => {
        setState((prev) => {
            // If already locked, do nothing (should be handled by disabled button)
            if (prev.lockedUntil && Date.now() < prev.lockedUntil) {
                return prev
            }

            // If lock expired, reset
            if (prev.lockedUntil && Date.now() > prev.lockedUntil) {
                return { attempts: 1, lockedUntil: null }
            }

            const newAttempts = prev.attempts + 1
            if (newAttempts >= maxAttempts) {
                return {
                    attempts: newAttempts,
                    lockedUntil: Date.now() + lockoutDuration,
                }
            }

            return { ...prev, attempts: newAttempts }
        })
    }, [maxAttempts, lockoutDuration])

    const resetAttempts = useCallback(() => {
        setState({ attempts: 0, lockedUntil: null })
    }, [])

    const isLocked = state.lockedUntil !== null && Date.now() < state.lockedUntil
    const remainingTime = state.lockedUntil ? Math.ceil((state.lockedUntil - Date.now()) / 1000) : 0

    return {
        isLocked,
        remainingTime,
        recordAttempt,
        resetAttempts,
    }
}
