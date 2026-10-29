'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Moon, Sun, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'

export type OrganizerTheme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'hh-organizer-theme'

/**
 * Dark mode is SCOPED TO THE DASHBOARD, and that is a product decision, not a
 * limitation. The landing page was deliberately rebuilt from dark to light, and
 * every public surface -- event pages, storefronts, checkout -- is light by
 * design. An organizer who turns this on is changing their workspace, not the
 * pages their buyers see.
 *
 * The class therefore goes on <html>, not on a wrapper div inside the layout.
 * It has to: Radix renders dialogs, dropdowns and toasts through a portal
 * attached to <body>, so anything mounted on a wrapper leaves every modal in
 * the dashboard rendering light over a dark page. The provider removes the
 * class when it unmounts, which is what keeps the theme from following the
 * organizer out to the public site.
 */

/**
 * Runs before the dashboard paints, inlined by the layout.
 *
 * Without it the server sends light markup, React hydrates, the effect runs,
 * and only then does the page go dark -- a white flash on every full load, in
 * the product the organizer stares at all day. Kept dependency-free and tiny
 * because it blocks parsing, and wrapped in try/catch because localStorage
 * throws outright in a locked-down private window.
 */
export const ORGANIZER_THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`

interface ThemeContextValue {
    theme: OrganizerTheme
    /** What the theme actually resolves to right now; 'system' is never returned. */
    resolved: 'light' | 'dark'
    setTheme: (t: OrganizerTheme) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

function systemPrefersDark(): boolean {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function readStored(): OrganizerTheme {
    if (typeof window === 'undefined') return 'system'
    try {
        const v = localStorage.getItem(STORAGE_KEY)
        return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
    } catch {
        return 'system'
    }
}

export function OrganizerThemeProvider({ children }: { children: ReactNode }) {
    // Always 'system' on the first render, on both server and client, so
    // hydration cannot mismatch. The inline script has already put the right
    // class on <html> by now, so this costs no flash -- the effect below only
    // catches up the React-side value.
    const [theme, setThemeState] = useState<OrganizerTheme>('system')
    const [resolved, setResolved] = useState<'light' | 'dark'>('light')

    const apply = useCallback((next: OrganizerTheme) => {
        const dark = next === 'dark' || (next === 'system' && systemPrefersDark())
        document.documentElement.classList.toggle('dark', dark)
        setResolved(dark ? 'dark' : 'light')
    }, [])

    useEffect(() => {
        const stored = readStored()
        setThemeState(stored)
        apply(stored)

        // Leaving the dashboard must not leave <html> dark: the landing page and
        // every public event page are light-only, and would render unreadable.
        return () => document.documentElement.classList.remove('dark')
    }, [apply])

    // Follow the OS while, and only while, the organizer has chosen 'system'.
    useEffect(() => {
        if (theme !== 'system') return
        const mq = window.matchMedia('(prefers-color-scheme: dark)')
        const onChange = () => apply('system')
        mq.addEventListener('change', onChange)
        return () => mq.removeEventListener('change', onChange)
    }, [theme, apply])

    const setTheme = useCallback((next: OrganizerTheme) => {
        setThemeState(next)
        apply(next)
        try {
            localStorage.setItem(STORAGE_KEY, next)
        } catch {
            // Private mode. The choice holds for this page, just not the next one.
        }
    }, [apply])

    return (
        <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}

export function useOrganizerTheme() {
    const ctx = useContext(ThemeContext)
    if (!ctx) throw new Error('useOrganizerTheme must be used within OrganizerThemeProvider')
    return ctx
}

const OPTIONS: { value: OrganizerTheme; label: string; Icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', Icon: Sun },
    { value: 'dark', label: 'Dark', Icon: Moon },
    { value: 'system', label: 'System', Icon: Monitor },
]

/**
 * Three states, not a two-way switch. 'System' is the one most people want and
 * the one a binary toggle cannot express -- without it, an organizer whose
 * laptop flips to dark at sunset has to come back and flip this too.
 */
export function OrganizerThemeToggle({ className }: { className?: string }) {
    const { theme, setTheme } = useOrganizerTheme()

    return (
        <div
            role="radiogroup"
            aria-label="Colour theme"
            className={cn('flex items-center gap-0.5 rounded-md bg-muted p-0.5', className)}
        >
            {OPTIONS.map(({ value, label, Icon }) => {
                const active = theme === value
                return (
                    <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        title={label}
                        onClick={() => setTheme(value)}
                        className={cn(
                            'flex flex-1 items-center justify-center rounded px-2 py-1.5 transition-colors',
                            active
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground',
                        )}
                    >
                        <Icon className="h-3.5 w-3.5" />
                        <span className="sr-only">{label}</span>
                    </button>
                )
            })}
        </div>
    )
}
