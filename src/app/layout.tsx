import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { SmoothScroll } from '@/components/landing/smooth-scroll';

export const metadata: Metadata = {
  title: 'HangHut | Dining is Better Together',
  description: 'Discover new restaurants, join dining groups, and meet new people. HangHut makes every meal a social experience.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="!scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased selection:bg-primary/30 selection:text-primary-foreground">
        <SmoothScroll>
          <div className="bg-noise" />
          {children}
          <Toaster />
        </SmoothScroll>
      </body>
    </html>
  );
}
