'use client'

import { useEffect } from 'react'

interface BrandingProviderProps {
    branding: {
        colors?: {
            primary?: string
            secondary?: string
            accent?: string
        }
    }
    children: React.ReactNode
}

// Helper to convert Hex to HSL
function hexToHSL(hex: string): string | null {
    let r = 0, g = 0, b = 0
    // 3 digits
    if (hex.length === 4) {
        r = parseInt("0x" + hex[1] + hex[1])
        g = parseInt("0x" + hex[2] + hex[2])
        b = parseInt("0x" + hex[3] + hex[3])
    }
    // 6 digits
    else if (hex.length === 7) {
        r = parseInt("0x" + hex[1] + hex[2])
        g = parseInt("0x" + hex[3] + hex[4])
        b = parseInt("0x" + hex[5] + hex[6])
    } else {
        return null
    }

    r /= 255
    g /= 255
    b /= 255

    let cmin = Math.min(r, g, b),
        cmax = Math.max(r, g, b),
        delta = cmax - cmin,
        h = 0,
        s = 0,
        l = 0

    if (delta === 0)
        h = 0
    else if (cmax === r)
        h = ((g - b) / delta) % 6
    else if (cmax === g)
        h = (b - r) / delta + 2
    else
        h = (r - g) / delta + 4

    h = Math.round(h * 60)

    if (h < 0)
        h += 360

    l = (cmax + cmin) / 2
    s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1))
    s = +(s * 100).toFixed(1)
    l = +(l * 100).toFixed(1)

    return `${h} ${s}% ${l}%`
}

export function BrandingProvider({ branding, children }: BrandingProviderProps) {
    useEffect(() => {
        if (!branding?.colors) return

        const root = document.documentElement

        // Helper to set variable if color exists and is valid
        const setVar = (name: string, hex?: string) => {
            if (hex) {
                const hsl = hexToHSL(hex)
                if (hsl) {
                    root.style.setProperty(`--${name}`, hsl)
                }
            }
        }

        setVar('primary', branding.colors.primary)
        // Set ring to match primary
        if (branding.colors.primary) {
            const hsl = hexToHSL(branding.colors.primary)
            if (hsl) root.style.setProperty('--ring', hsl)
        }

        setVar('secondary', branding.colors.secondary)
        setVar('accent', branding.colors.accent)

        // Cleanup function (optional, but good practice if checking out multiple stores in SPA navigation)
        return () => {
            root.style.removeProperty('--primary')
            root.style.removeProperty('--ring')
            root.style.removeProperty('--secondary')
            root.style.removeProperty('--accent')
        }
    }, [branding])

    return <>{children}</>
}
