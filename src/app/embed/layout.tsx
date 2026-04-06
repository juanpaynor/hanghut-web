import type { Metadata } from 'next'
import '../globals.css'

export const metadata: Metadata = {
    title: 'HangHut Widget',
    robots: { index: false, follow: false },
}

export default function EmbedLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
            </head>
            <body className="font-body antialiased bg-transparent" style={{ margin: 0, padding: 0 }}>
                {children}
                <EmbedBridge />
            </body>
        </html>
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
