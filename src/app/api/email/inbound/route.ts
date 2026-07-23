import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { recordInviteDecision } from "@/lib/introductions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Inbound-email webhook: the "agent" that monitors replies to a match invite.
// A matched person replies "Y"/"N" to their invite email, whose Reply-To carries
// the invite token (r+<token>@<RESEND_INBOUND_DOMAIN>). Resend Inbound routes the
// message here as a signed `email.received` webhook whose payload is METADATA
// ONLY (to/from/subject/email_id, no body). We pull the token from the recipient
// address in that metadata; only when a token matches do we fetch the message
// body via the Received Emails API, read Y/N, and record the decision (which
// connects the pair the moment both say yes). Emails without our token (other
// projects share this account's inbound stream) are ignored without any fetch.
//
// Setup: enable receiving on a domain in Resend, add its MX record, create a
// webhook for `email.received` pointed here (POST {APP_URL}/api/email/inbound),
// and set RESEND_INBOUND_DOMAIN + RESEND_WEBHOOK_SECRET (the whsec_... from the
// webhook). The /i/[token] Yes/Pass buttons work with none of this configured;
// this endpoint adds the reply-by-email path.

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

// Fetch the full received message (the webhook carries metadata only) so we can
// read the reply body. Provider or database failures throw so Resend retries the
// signed webhook. The decision transition is atomic, so a retry is safe.
async function fetchReceivedText(emailId: string): Promise<string> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !emailId) throw new Error("received email fetch is not configured");
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        // api.resend.com is Cloudflare-fronted and returns 1010/403 to requests
        // with no (or a bare "node") User-Agent. A normal browser UA clears it.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
    if (!res.ok) {
      throw new Error(`receiving fetch returned ${res.status}`);
    }
    const j = (await res.json()) as { text?: string; html?: string };
    if (j.text) return j.text;
    // Fall back to a stripped-tags version of the HTML if there is no text part.
    return (j.html || "").replace(/<[^>]+>/g, " ");
  } catch (e) {
    console.error(`[email:inbound] receiving fetch threw: ${(e as Error).message}`);
    throw e;
  }
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
    if (evt.type && evt.type !== "email.received") return new Response("ignored", { status: 200 });
    const data = (evt.data ?? {}) as Record<string, unknown>;

    // Route on the recipient token FIRST (it is in the metadata). No token means
    // this message is not one of our invite replies, so we return without ever
    // fetching the body, keeping other projects' inbound mail untouched.
    const token =
      tokenFromRecipients(data.to) ||
      tokenFromRecipients(data.reply_to) ||
      tokenFromRecipients((data.headers as Record<string, unknown> | undefined)?.["to"]);
    if (!token) return new Response("no token", { status: 200 });

    // Body only for our own messages. Prefer any inline text, else fetch it.
    let bodyText = String(data.text ?? "");
    if (!bodyText) {
      const emailId = String(data.email_id ?? data.id ?? "");
      bodyText = await fetchReceivedText(emailId);
    }

    const first = firstReplyLine(bodyText);
    let decision: "yes" | "pass" | null = null;
    if (YES.test(first)) decision = "yes";
    else if (NO.test(first)) decision = "pass";
    if (!decision) return new Response("no decision", { status: 200 }); // ambiguous, ignore

    await recordInviteDecision(token, decision);
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error(`[email:inbound] ${(e as Error).message}`);
    Sentry.captureException(e);
    return new Response("temporary failure", {
      status: 503,
      headers: { "Retry-After": "30" },
    });
  }
}
