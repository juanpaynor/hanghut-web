/**
 * The support chime, synthesized rather than loaded.
 *
 * No audio file: an asset is one more thing to ship, cache-bust and 404 on,
 * and a two-note ping is a dozen lines of WebAudio. It also means the sound
 * works offline and costs nothing until the first time it actually plays.
 *
 * Everything here fails silently. A notification sound is the least important
 * thing on the page, and no part of it may ever take the support widget down
 * with it -- WebAudio is missing in some embedded webviews, blocked by
 * autoplay policy until the user has interacted with the page, and throws
 * outright under a strict Permissions-Policy.
 */

const PREF_KEY = 'hh:support-sound'

/** Sound is on unless the organizer turned it off. */
export function isSoundEnabled(): boolean {
    try {
        return localStorage.getItem(PREF_KEY) !== 'off'
    } catch {
        // Private mode, blocked storage: default to on rather than silent.
        return true
    }
}

export function setSoundEnabled(on: boolean): void {
    try {
        localStorage.setItem(PREF_KEY, on ? 'on' : 'off')
    } catch {
        /* preference just will not persist */
    }
}

// Created on first play, not on import. A context built at module load sits
// in "suspended" forever on a page nobody interacts with, and some browsers
// log a warning for it.
let ctx: AudioContext | null = null

function audioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    try {
        const Ctor =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Ctor) return null
        ctx ??= new Ctor()
        return ctx
    } catch {
        return null
    }
}

/** Two sine notes, a rising minor third, ~0.4s in total. */
const NOTES: { freq: number; at: number }[] = [
    { freq: 880.0, at: 0 },      // A5
    { freq: 1174.66, at: 0.11 }, // D6
]

export function playSupportChime(): void {
    if (!isSoundEnabled()) return

    const ac = audioContext()
    if (!ac) return

    try {
        // Until the organizer has clicked something, the context is suspended
        // by autoplay policy. Resuming is a promise that can reject; the first
        // chime of a session may simply be lost, which is the correct outcome.
        if (ac.state === 'suspended') void ac.resume().catch(() => {})

        const now = ac.currentTime

        for (const { freq, at } of NOTES) {
            const osc = ac.createOscillator()
            const gain = ac.createGain()

            osc.type = 'sine'
            osc.frequency.value = freq

            // Exponential ramps, because loudness is perceived logarithmically
            // and a linear fade on a sine reads as a click at both ends. They
            // cannot touch zero, hence the 0.0001 floor.
            const t = now + at
            gain.gain.setValueAtTime(0.0001, t)
            gain.gain.exponentialRampToValueAtTime(0.16, t + 0.015)
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.26)

            osc.connect(gain)
            gain.connect(ac.destination)
            osc.start(t)
            osc.stop(t + 0.3)
        }
    } catch {
        /* no sound is always better than a crash */
    }
}
