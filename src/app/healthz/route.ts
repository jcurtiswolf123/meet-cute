import { NextResponse } from "next/server";

// Liveness probe for Fly health checks. Deliberately shallow: it proves the
// Node server is up and serving, and does NOT touch the database. A transient
// Neon blip must not mark every machine unhealthy and pull the whole app down;
// DB failures surface through Sentry and the page-level error handling instead.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() }, { status: 200 });
}
