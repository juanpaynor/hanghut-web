import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverActions: {
      // Headroom for settings saves that carry logo + cover + ticket banner at once.
      bodySizeLimit: '12mb',
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [320, 640, 960, 1280, 1536, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 2678400, // 31 days — user uploads are immutable (content-hashed paths)
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      // Allow user uploaded assets from Supabase
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        port: '',
        pathname: '/**',
      },
      // Custom API domain for HangHut
      {
        protocol: 'https',
        hostname: 'api.hanghut.com',
        port: '',
        pathname: '/**',
      },
      // App store badges
      {
        protocol: 'https',
        hostname: 'developer.apple.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'play.google.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async rewrites() {
    return [
      // iOS Universal Links: serve the AASA at the exact extensionless path Apple
      // requires, from the /aasa route handler (internal rewrite = 200, no redirect).
      { source: '/.well-known/apple-app-site-association', destination: '/aasa' },
      // Android App Links: Digital Asset Links file (same no-redirect requirement).
      { source: '/.well-known/assetlinks.json', destination: '/assetlinks' },
    ]
  },
  async headers() {
    // Security headers shared by every route.
    const commonHeaders = [
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload'
      },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self), payment=*' }
    ]

    return [
      // App routes: block framing entirely (clickjacking protection). Excludes
      // /embed and /checkout, which are designed to be embedded on partner sites.
      {
        source: '/((?!embed|checkout).*)',
        headers: [
          ...commonHeaders,
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' }
        ]
      },
      // Embeddable routes: NO X-Frame-Options (legacy, no allowlist support).
      // frame-ancestors * lets partners iframe the widget + checkout on any domain.
      {
        source: '/embed/:path*',
        headers: [
          ...commonHeaders,
          { key: 'Content-Security-Policy', value: 'frame-ancestors *' }
        ]
      },
      {
        source: '/checkout/:path*',
        headers: [
          ...commonHeaders,
          { key: 'Content-Security-Policy', value: 'frame-ancestors *' }
        ]
      },
      {
        source: '/checkout',
        headers: [
          ...commonHeaders,
          { key: 'Content-Security-Policy', value: 'frame-ancestors *' }
        ]
      }
    ]
  }
};

export default nextConfig;
