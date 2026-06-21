// Sentry server-side init (Node runtime). Loaded from src/instrumentation.ts.
//
// No-op until SENTRY_DSN is set, so local dev and the current deploy are
// unaffected until observability is turned on with a single env var.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  // Dating app: never let Sentry auto-attach user identifiers, IPs, or request
  // bodies. We opt specific, non-PII context in by hand if needed.
  sendDefaultPii: false,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  environment: process.env.NODE_ENV,
});
