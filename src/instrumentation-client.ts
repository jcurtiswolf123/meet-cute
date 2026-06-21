// Sentry browser init. No-op until NEXT_PUBLIC_SENTRY_DSN is set. Client events
// are sent through the same-origin tunnel (/monitoring, configured in
// next.config) so the strict CSP (connect-src 'self') and ad-blockers don't
// drop them.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  sendDefaultPii: false,
  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  environment: process.env.NODE_ENV,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
