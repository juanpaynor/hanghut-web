import type { Metadata } from 'next'
import '../globals.css'

export const metadata: Metadata = {
    title: 'HangHut Widget',
    robots: { index: false, follow: false },
}

/**
 * NOT a root layout.
 *
 * This used to render its own <html>, <head> and <body>. Those are already
 * rendered by src/app/layout.tsx — a root layout always applies — so the
 * browser received <body>…<html><head>…</head><body>…, which it cannot
 * represent. It discards the inner tags and merges their attributes onto the
 * outer ones, so the DOM never matches what React rendered and hydration fails
 * on every load of /embed/*:
 *
 *   "Hydration failed because the server rendered HTML didn't match the client"
 *   "You are mounting a new html component when a previous one has not…"
 *
 * Escaping a root layout needs route groups with two root layouts, not a
 * nested <html>. Everything that layout was reaching for — transparent ground,
 * no gutter, the Inter face — is done below without a second document.
 * Components that must not run inside a widget already self-gate on the path;
 * see cookie-consent.tsx.
 */
export default function EmbedLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <>
            {/* `precedence` is what tells React 19 to hoist a stylesheet into
                <head> and dedupe it. Without it the tag renders where it sits,
                which for a stylesheet means a flash of unstyled widget. */}
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link
                rel="stylesheet"
                href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
                precedence="default"
            />
            {/* The widget is painted onto the publisher's page, so it must not
                bring the app's own background or the body gutter with it.
                globals.css applies `bg-background` to body for every route. */}
            <style
                dangerouslySetInnerHTML={{
                    __html: 'html,body{background:transparent!important;margin:0!important;padding:0!important}',
                }}
            />
            {children}
            <EmbedBridge />
        </>
    )
}

/**
 * Injects a tiny script that:
 * 1. Reports iframe height to parent for auto-resize
 * 2. Provides a global postToParent helper for child pages
 */
function EmbedBridge() {
    return (
        <script
            dangerouslySetInnerHTML={{
                __html: `
                    window.__hanghutEmbed = true;
                    window.postToParent = function(data) {
                        window.parent.postMessage(data, '*');
                    };
                    // Auto-resize: report height periodically
                    function reportHeight() {
                        var h = document.body.scrollHeight;
                        var frameId = new URLSearchParams(window.location.search).get('_frameId');
                        if (frameId) {
                            window.parent.postMessage({
                                type: 'HANGHUT_RESIZE',
                                frameId: frameId,
                                height: h
                            }, '*');
                        }
                    }
                    setInterval(reportHeight, 500);
                    window.addEventListener('load', reportHeight);
                `,
            }}
        />
    )
}
