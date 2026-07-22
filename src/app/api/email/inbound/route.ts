import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { recordInviteDecision } from "@/lib/introductions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Inbound-email webhook: the "agent" that monitors replies to a match invite.
// A matched person replies "Y"/"N" to their invite email, whose Reply-To carries
// the invite token (r+<token>@<RESEND_INBOUND_DOMAIN>). Resend Inbound routes the
// message here as a signed webhook; we pull the token from the recipient address,
// read Y/N from the reply body, and record the decision (which connects the pair
// the moment both say yes).
//
// Setup: verify the inbound domain in Resend, point its inbound webhook here
//   POST {NEXT_PUBLIC_APP_URL}/api/email/inbound
// and set RESEND_INBOUND_DOMAIN + RESEND_WEBHOOK_SECRET (the whsec_... signing
// secret from the Resend webhook). The web Yes/Pass buttons on /i/[token] work
// with no inbound setup at all; this endpoint adds the reply-by-email path.

const YES = /^\s*(y|ye|yes|yeah|yep|yup|sure|ok|okay|absolutely|sounds good|do it)\b/i;
const NO = /^\s*(n|no|nope|nah|pass|decline)\b/i;

// Verify a Svix/Resend webhook signature. Fails closed in production when the
// secret is set. Returns true in dev when no secret is configured (local testing).
function verifySignature(secret: string | undefined, req: NextRequest, rawBody: string): boolean {
  if (!secret) return process.env.NODE_ENV !== "production";
  const id = req.headers.get("svix-id");
  const ts = req.headers.get("svix-timestamp");
  const sigHeader = req.headers.get("svix-signature");
  if (!id || !ts || !sigHeader) return false;

  // whsec_<base64key>; the HMAC is over `${id}.${ts}.${body}`.
  const keyB64 = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let key: Buffer;
  try {
    key = Buffer.from(keyB64, "base64");
  } catch {
    return false;
  }
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${rawBody}`).digest("base64");
  // Header is a space-separated list of `v1,<sig>` (there may be several).
  for (const part of sigHeader.split(" ")) {
    const sig = part.includes(",") ? part.split(",")[1] : part;
    if (!sig) continue;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

// Pull the invite token out of any `r+<token>@domain` recipient address.
function tokenFromRecipients(to: unknown): string | null {
  const addrs: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string") addrs.push(v);
    else if (v && typeof v === "object") {
      const a = (v as { address?: string; email?: string }).address ?? (v as { email?: string }).email;
      if (a) addrs.push(a);
    }
  };
  if (Array.isArray(to)) to.forEach(push);
  else push(to);
  for (const a of addrs) {
    const m = a.match(/r\+([A-Za-z0-9_-]+)@/i);
    if (m) return m[1];
  }
  return null;
}

// First meaningful line of a reply: skip blank lines and quoted history
// ("> ..." or "On ... wrote:"), so "Y" on its own line above the quote wins.
function firstReplyLine(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith(">")) break;
    if (/^On .*wrote:$/i.test(t)) break;
    return t;
  }
  return "";
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    if (!verifySignature(process.env.RESEND_WEBHOOK_SECRET, req, raw)) {
      return new Response("invalid signature", { status: 403 });
    }

    let evt: { type?: string; data?: Record<string, unknown> } = {};
    try {
      evt = JSON.parse(raw || "{}");
    } catch {
      return new Response("bad json", { status: 400 });
    }
    const data = (evt.data ?? {}) as Record<string, unknown>;

    // Recipient carries the token. Check `to`, then any reply-to/headers echo.
    const token =
      tokenFromRecipients(data.to) ||
      tokenFromRecipients(data.reply_to) ||
      tokenFromRecipients((data.headers as Record<string, unknown> | undefined)?.["to"]);
    if (!token) return new Response("no token", { status: 200 }); // not an invite reply

    const bodyText = String(data.text ?? data.stripped_text ?? "");
    const first = firstReplyLine(bodyText);
    let decision: "yes" | "pass" | null = null;
    if (YES.test(first)) decision = "yes";
    else if (NO.test(first)) decision = "pass";
    if (!decision) return new Response("no decision", { status: 200 }); // ambiguous reply, ignore

    await recordInviteDecision(token, decision);
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error(`[email:inbound] ${(e as Error).message}`);
    Sentry.captureException(e);
    // 200 so the provider does not hammer retries on a message we can't parse.
    return new Response("ok", { status: 200 });
  }
}
