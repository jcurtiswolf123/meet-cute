import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "img-src 'self' https://i.pravatar.cc data:",
      // Next injects inline/eval scripts; keep this pragmatic for the app to run.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' https://fonts.gstatic.com data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig = {
  output: "standalone",
  typescript: { ignoreBuildErrors: false },
  // Stamp every build with the commit it came from. Mutuals ships several times
  // a day onto two always-on machines, so a person mid-application is routinely
  // holding a page from the previous build. Without a deployment id, that
  // page's asset URLs are indistinguishable from the new build's, so a browser
  // or CDN can serve a chunk from one build against a document from another.
  // With it, Next appends `?dpl=<id>` to asset URLs (each build gets its own
  // cache entries) and sends `x-deployment-id` on server action and navigation
  // requests, which is what makes a skew visible rather than a mystery.
  //
  // It does NOT make a stale server action recover by itself. Nothing does:
  // Next's own guidance is to reload, and `src/app/error.tsx` is what carries
  // that out. This is the half that keeps the assets straight.
  //
  // Supplied by the deploy job as a build arg (see Dockerfile and
  // .github/workflows/deploy.yml). Undefined for a plain local build, which is
  // the pre-existing behaviour and fine: there is only ever one local build.
  deploymentId: process.env.NEXT_DEPLOYMENT_ID || undefined,
  // Development only. Next 16 blocks cross-origin requests for dev resources,
  // and it treats 127.0.0.1 as a different origin from localhost: the sandbox
  // server and every browser test address it by IP, so the client bundle was
  // refused and the page rendered but never hydrated. Server actions still
  // worked (they degrade to a plain form post), which is why nothing looked
  // wrong until the first control that genuinely needs JavaScript - the photo
  // uploader - did nothing when clicked. Ignored entirely in production builds.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  images: { remotePatterns: [{ protocol: "https", hostname: "i.pravatar.cc" }] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    // Canonical host is hellomutuals.com. Send www, the pre-rename
    // hellomeetcute.com, and the original meetcutehq.com (and their www forms)
    // there so there is one canonical address.
    const toApex = (host) => ({
      source: "/:path*",
      has: [{ type: "host", value: host }],
      destination: "https://hellomutuals.com/:path*",
      permanent: true,
    });
    return [
      toApex("www.hellomutuals.com"),
      toApex("hellomeetcute.com"),
      toApex("www.hellomeetcute.com"),
      toApex("meetcutehq.com"),
      toApex("www.meetcutehq.com"),
    ];
  },
};

// Only wrap with Sentry once a DSN is configured. With no DSN the build is
// byte-for-byte the current build (no source-map upload step, no tunnel route),
// so turning observability on is a pure env-var change.
const sentryEnabled = !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      // Planned Sentry project: org "riiva", slug "meet-cute". Env vars win so
      // the target can move without a code change.
      org: process.env.SENTRY_ORG || "riiva",
      project: process.env.SENTRY_PROJECT || "meet-cute",
      authToken: process.env.SENTRY_AUTH_TOKEN, // set at build time to upload source maps
      silent: !process.env.CI,
      widenClientFileUpload: true,
      disableLogger: true,
      // Same-origin tunnel keeps client events within connect-src 'self'.
      tunnelRoute: "/monitoring",
    })
  : nextConfig;
