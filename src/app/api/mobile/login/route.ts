import { NextResponse } from "next/server";
import { sendMagicLink } from "@/lib/magic-link";

export const dynamic = "force-dynamic";

// The JSON half of /login, for the iOS shell, which draws a native sign-in
// screen rather than a web form. It mails the same one-time link to the same
// /auth/verify route through the same rate limits: lib/magic-link.ts is the one
// implementation, and this is a transport on top of it.
export async function POST(request: Request) {
  let email = "";
  try {
    const body = (await request.json()) as { email?: unknown };
    email = typeof body.email === "string" ? body.email : "";
  } catch {
    return NextResponse.json({ ok: false, outcome: "email" }, { status: 400 });
  }

  const outcome = await sendMagicLink(email);
  return NextResponse.json(
    { ok: outcome === "sent", outcome },
    { status: outcome === "throttled" ? 429 : 200, headers: { "cache-control": "no-store" } },
  );
}
