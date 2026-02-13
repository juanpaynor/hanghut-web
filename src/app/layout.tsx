import type { Metadata } from 'next';
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
  manifest: '/manifest.json',
};

// JSON-LD Structured Data for Organization
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'HangHut',
  url: 'https://hanghut.com',
  logo: 'https://hanghut.com/logo.png',
  sameAs: [
    'https://twitter.com/hanghutapp',
    'https://instagram.com/hanghutapp',
    'https://facebook.com/hanghutapp'
  ],
  description: 'HangHut is a social marketplace connecting people through real-world events and experiences.'
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="!scroll-smooth" data-scroll-behavior="smooth">
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
        </SmoothScroll>
      </body>
    </html>
  );
}
