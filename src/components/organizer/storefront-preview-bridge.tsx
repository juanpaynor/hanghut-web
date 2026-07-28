"use client"

import { useEffect } from "react"
import { hexToHsl } from "@/lib/utils"
import { getEventThemeCss } from "@/lib/event-themes"

/**
 * Live-preview bridge. Rendered on the public event page ONLY when it's loaded
 * inside the Design tab's preview iframe (?hh_preview=1). It announces "ready"
 * to the parent editor, then applies design changes the editor pushes via
 * postMessage — so the organizer sees CSS-skin edits (accent, fonts, theme,
 * custom CSS) live, before saving. Structural/content edits reflect on save
 * (the editor reloads the frame). Renders nothing.
 */

// Mirror of the page's FONT_MAP css stacks (id -> font-family) for live swaps.
const FONT_CSS: Record<string, string> = {
    inter: "Inter, sans-serif",
    playfair: "'Playfair Display', serif",
    grotesk: "'Space Grotesk', sans-serif",
    bebas: "'Bebas Neue', cursive",
    cormorant: "'Cormorant Garamond', serif",
    mono: "'JetBrains Mono', monospace",
    outfit: "'Outfit', sans-serif",
    dmserif: "'DM Serif Display', serif",
}

type PreviewPayload = {
    theme_color?: string | null
    theme?: string
    custom_css?: string
    font_heading?: string
    font_body?: string
    text_color?: string
    heading_color?: string
}

function styleTag(id: string): HTMLStyleElement {
    let el = document.getElementById(id) as HTMLStyleElement | null
    if (!el) {
        el = document.createElement("style")
        el.id = id
        document.head.appendChild(el)
    }
    return el
}

function applyPreview(p: PreviewPayload) {
    const roots = document.querySelectorAll<HTMLElement>("[data-hh-theme]")
    roots.forEach((root) => {
        if (p.theme !== undefined) root.setAttribute("data-hh-theme", p.theme || "classic")
        if (p.theme_color) {
            root.style.setProperty("--hh-accent", p.theme_color)
            try {
                root.style.setProperty("--primary", hexToHsl(p.theme_color))
                root.style.setProperty("--ring", hexToHsl(p.theme_color))
            } catch {
                /* invalid hex mid-typing — ignore */
            }
        }
        if (p.font_heading) root.style.setProperty("--font-heading", FONT_CSS[p.font_heading] || FONT_CSS.inter)
        if (p.font_body) root.style.setProperty("--font-body", FONT_CSS[p.font_body] || FONT_CSS.inter)
        if (p.text_color !== undefined) root.style.setProperty("--hh-text", p.text_color || "")
        if (p.heading_color !== undefined) root.style.setProperty("--hh-heading", p.heading_color || "")
    })
    if (p.theme !== undefined) styleTag("hh-preview-theme").textContent = getEventThemeCss(p.theme || "classic")
    if (p.custom_css !== undefined) {
        styleTag("hh-preview-custom").textContent = (p.custom_css || "").replace(/<\/?(style|script)\b[^>]*>/gi, "")
    }
}

export function StorefrontPreviewBridge() {
    useEffect(() => {
        if (typeof window === "undefined" || window.parent === window) return

        const onMessage = (e: MessageEvent) => {
            const d = e.data
            if (!d || d.source !== "hh-preview" || d.type !== "apply") return
            applyPreview(d.payload || {})
        }
        window.addEventListener("message", onMessage)

        // Announce we're ready so the editor pushes the current state.
        window.parent.postMessage({ source: "hh-preview", type: "ready" }, "*")

        // Keep the preview stable — clicks shouldn't navigate or start checkout.
        const stopNav = (e: Event) => {
            const t = e.target as HTMLElement | null
            if (t && t.closest("a, button")) {
                e.preventDefault()
                e.stopPropagation()
            }
        }
        document.addEventListener("click", stopNav, true)

        return () => {
            window.removeEventListener("message", onMessage)
            document.removeEventListener("click", stopNav, true)
        }
    }, [])

    return null
}
