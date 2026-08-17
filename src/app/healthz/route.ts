import { NextResponse } from "next/server";

// Liveness probe for Fly health checks. Deliberately shallow: it proves the
// Node server is up and serving, and does NOT touch the database. A transient
// Neon blip must not mark every machine unhealthy and pull the whole app down;
// DB failures surface through Sentry and the page-level error handling instead.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  // The commit this image was built from. `npm run deploy` passes it as
  // NEXT_DEPLOYMENT_ID, and scripts/deploy-guard.ts reads it back before the
  // next deploy so a branch that does not contain what production is already
  // serving cannot silently roll it back. On 2026-08-16 production lost the
  // studio streamline and the PWA that way: four deploys landed from a branch
  // cut before them, and nothing anywhere said so.
  const commit = process.env.NEXT_DEPLOYMENT_ID || null;
  return NextResponse.json({ ok: true, ts: Date.now(), commit }, { status: 200 });
}
