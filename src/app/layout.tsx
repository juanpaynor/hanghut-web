import type { Metadata, Viewport } from 'next';
import { ConsentedAnalytics } from '@/components/analytics/consented-analytics';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { SmoothScroll } from '@/components/landing/smooth-scroll';
import { CookieConsent } from '@/components/ui/cookie-consent';
import { LoadingProvider } from '@/providers/loading-provider';
export const metadata: Metadata = {
  metadataBase: new URL('https://hanghut.com'),
  title: {
    default: 'HangHut | Real Connections. Right Now.',
    template: '%s | HangHut'
  },
  description: 'HangHut is the social marketplace for real-world connections. Find events, get tickets, and meet people instantly. Stop scrolling, start hanging.',
  keywords: ['events', 'tickets', 'social app', 'meetups', 'nightlife', 'concerts', 'festivals', 'community'],
  authors: [{ name: 'HangHut Team' }],
  creator: 'HangHut Inc.',
  publisher: 'HangHut Inc.',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    title: 'HangHut | Real Connections. Right Now.',
    description: 'Find events. Get tickets. Live the experience. HangHut pulls you out of endless scrolling and into actual meetups.',
    url: 'https://hanghut.com',
    siteName: 'HangHut',
    images: [
      {
        url: 'https://hanghut.com/og-image.jpg', // You should create this image
        width: 1200,
        height: 630,
        alt: 'HangHut - Real Connections',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HangHut | Real Connections. Right Now.',
    description: 'The social marketplace for real-world connections. Find events, get tickets, and meet people nearby.',
    creator: '@hanghutapp', // Update with real handle
    images: ['https://hanghut.com/og-image.jpg'],
  },
  // icons: {
  //   icon: '/favicon.ico',
  //   shortcut: '/favicon.ico',
  //   apple: '/apple-touch-icon.png',
  // },
  // src/app/manifest.ts makes Next serve this at /manifest.webmanifest.
  // '/manifest.json' was never a route on any host, so this link 404'd
  // everywhere, not only on partner subdomains.
  manifest: '/manifest.webmanifest',
};

// JSON-LD Structured Data for Organization
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'HangHut',
  url: 'https://hanghut.com',
  logo: 'https://hanghut.com/logo_base.png',
  sameAs: [
    'https://www.instagram.com/hanghut.app/'
  ],
  description: 'HangHut is a social marketplace connecting people through real-world events and experiences.'
};

/**
 * Keep the PUBLIC site light, whatever the phone wants.
 *
 * Chrome on Android ("Auto Dark Theme") and Samsung Internet ("Dark mode")
 * will algorithmically repaint a page that does not say what it is -- they
 * darken surfaces and flip text colours by guesswork. On an event page wearing
 * an organizer's custom CSS, which sets `color: #fffef5 !important` on
 * everything, that guesswork puts text and its background at the same colour
 * and the copy simply vanishes. Reported by real buyers on TEN122's page; iOS
 * Safari never does this, which is why it only ever hit "some" phones.
 *
 * `only light` is the real opt-out. Plain `light` only says the page SUPPORTS
 * light and Chrome may still repaint it.
 *
 * `.dark` on <html> (the organizer dashboard) still wins, because a CSS
 * `color-scheme` on the root element beats this meta tag -- and the dashboard
 * layout also declares its own viewport, so the intent is written down in both
 * places rather than relying on that precedence.
 */
export const viewport: Viewport = { colorScheme: 'only light' };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // suppressHydrationWarning below is REQUIRED, not cosmetic.
  //
  // The dashboard inlines ORGANIZER_THEME_SCRIPT, which toggles `dark` onto
  // <html> before React hydrates — on purpose, so an organizer on dark mode
  // never sees a white flash on a full page load. React then hydrates this
  // element, finds class="!scroll-smooth dark" where it rendered
  // class="!scroll-smooth", and logs a mismatch. The DOM is correct and the
  // render is correct; what differs is one class deliberately written by a
  // script that has to run first.
  //
  // It covers THIS element's attributes only, not the tree below, so a genuine
  // mismatch anywhere inside the app is still reported.
  return (
    <html lang="en" className="!scroll-smooth" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@600;700&display=swap" rel="stylesheet" />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="font-body antialiased selection:bg-primary/30 selection:text-primary-foreground">
        <SmoothScroll>
          <LoadingProvider>
            <div className="bg-noise" />
            {children}
            <Toaster />
            <CookieConsent />
          </LoadingProvider>
          <ConsentedAnalytics />
        </SmoothScroll>
      </body>
    </html>
  );
}
