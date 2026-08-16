import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Signing out from the native shell. The web app signs out through a server
// action, which the app cannot call, so this is the same `clearSession` behind
// a route.
//
// Requires `X-Mutuals-Client`. A cross-site form post cannot set a custom
// header without a CORS preflight the browser will refuse, so this is the
// cheapest thing that stops a third-party page silently signing a member out.
export async function POST(request: Request) {
  if (!request.headers.get("x-mutuals-client")) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  await clearSession();
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
