// '@sentry/nextjs/config', not the package root. v11 moved the build-time
// helper out of the main entry point, which resolves to the runtime SDK here
// and gives "withSentryConfig is not a function" at build.
import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverActions: {
      // MUST stay under Vercel's hard 4.5MB function-body ceiling. A limit
      // above it is fiction: Vercel rejects the request at the edge first, and
      // the organizer gets Next's unparseable-response error with nothing
      // logged anywhere. Images no longer travel in these bodies at all (they
      // go browser-direct to storage), so 4mb is pure headroom for text —
      // description HTML, tiers, questions, terms documents — and it fails
      // with our message instead of the platform's silence.
      bodySizeLimit: '4mb',
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
      // Partner-hosted assets on Cloudflare. Partners who bring their own
      // storage (rather than uploading to ours) land here — an event whose
      // cover lives on a host that is NOT in this list renders as nothing,
      // because the optimizer answers /_next/image with
      // 400 "url parameter is not allowed" even though the URL itself is
      // perfectly public. R2 public buckets:
      {
        protocol: 'https',
        hostname: '**.r2.dev',
        port: '',
        pathname: '/**',
      },
      // Cloudflare Images delivery.
      {
        protocol: 'https',
        hostname: 'imagedelivery.net',
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

/**
 * Sentry wrapper.
 *
 * Only changes the BUILD (source maps, the instrumentation hooks). Whether
 * anything is actually reported is decided at runtime by the DSN env var, so
 * this is inert until SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN are set.
 *
 * Source maps upload only when SENTRY_AUTH_TOKEN is present; without it the
 * build logs a notice and carries on rather than failing. That ordering is
 * deliberate for a money-path app -- a missing observability token must never
 * be the thing that stops a deploy.
 */
/**
 * Tree-shake the Sentry features we do not use.
 *
 * Adding the SDK took shared First Load JS from 102 kB to 171 kB, which is a
 * lot to put on every page of a consumer ticketing site whose buyers are mostly
 * on phones. Tracing and Replay are both switched off at runtime
 * (tracesSampleRate 0, replay rates 0) but their code still ships unless these
 * flags let the bundler drop it. Flip the flag if you ever turn the feature on,
 * or it will be silently inert.
 */
const withBundleFlags: NextConfig = {
  ...nextConfig,
  webpack: (config, options) => {
    config.plugins.push(
      new options.webpack.DefinePlugin({
        __SENTRY_DEBUG__: false,
        __SENTRY_TRACING__: false,
        __RRWEB_EXCLUDE_IFRAME__: true,
        __RRWEB_EXCLUDE_SHADOW_DOM__: true,
        __SENTRY_EXCLUDE_REPLAY_WORKER__: true,
      }),
    )
    return config
  },
}

export default withSentryConfig(withBundleFlags, {
  org: 'hanghut-inc',
  project: 'web',
  silent: !process.env.CI,
  // Readable stack traces in Sentry without serving .map files publicly.
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  // Routes Sentry's own requests through our domain so ad blockers do not eat
  // the reports -- which would quietly recreate the problem this solves.
  tunnelRoute: '/monitoring',
  // (disableLogger removed: not an option in @sentry/nextjs v11, and the
  //  __SENTRY_DEBUG__ define above already strips the logger from the bundle.)
});
