import { NextResponse } from "next/server";

// Guarded Sentry smoke test. Does nothing unless called with ?sentrytest=1, in
// which case it throws so the error flows through instrumentation onRequestError
// into Sentry. Use it to confirm wiring after setting SENTRY_DSN:
//   curl "https://meet-cute.fly.dev/api/sentry-test?sentrytest=1"
// With no query param it returns a harmless ok, so the route is safe to deploy.
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("sentrytest") === "1") {
    throw new Error("Sentry test error from meet-cute");
  }
  return NextResponse.json({ ok: true });
}
