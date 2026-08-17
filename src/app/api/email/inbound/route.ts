import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { recordInviteDecision } from "@/lib/introductions";
import { prisma } from "@/lib/prisma";
import { recordAnswer } from "@/lib/recommendations";
import { afterRecommendationAnswer } from "@/lib/actions";
import { htmlToReplyText, stripQuotedHistory } from "@/lib/reply-parse";
import { decisionFromReply } from "@/lib/reply-parse";

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

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

// Verify a Svix/Resend webhook signature. Fails closed in production when the
// secret is set. Returns true in dev when no secret is configured (local testing).
function verifySignature(secret: string | undefined, req: NextRequest, rawBody: string): boolean {
  if (!secret) return process.env.NODE_ENV !== "production";
  const id = req.headers.get("svix-id");
  const ts = req.headers.get("svix-timestamp");
  const sigHeader = req.headers.get("svix-signature");
  if (!id || !ts || !sigHeader) return false;
  const timestamp = Number(ts);
  const now = Math.floor(Date.now() / 1000);
  if (
    !Number.isFinite(timestamp) ||
    Math.abs(now - timestamp) > SIGNATURE_TOLERANCE_SECONDS
  ) {
    return false;
  }

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
// RESEND_INBOUND_DOMAIN may list several domains, comma-separated. Accepting
// more than one is what makes changing the reply address safe: invites already
// in a member's inbox carry the old Reply-To, and a reply to an unlisted domain
// is dropped as "no token", so the old domain has to stay accepted until every
// outstanding invite is decided or expired.
function tokenFromRecipients(to: unknown, expectedDomains: string[]): string | null {
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
    const m = a.match(/r\+([A-Za-z0-9_-]+)@([A-Za-z0-9.-]+)/i);
    if (m && expectedDomains.includes(m[2]?.toLowerCase())) return m[1];
  }
  return null;
}

/** Every domain whose `r+<token>@` replies we accept. The first entry is the one
 *  new invites are sent from (see inviteReplyAddress); the rest are legacy
 *  addresses kept alive for invites already in flight. */
function inboundDomains(): string[] {
  return (process.env.RESEND_INBOUND_DOMAIN || "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

/** Every address on the message, in the shapes Resend uses (string, `Name <a@b>`,
 *  or an object with `address`/`email`). */
function addressList(...fields: unknown[]): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (v && typeof v === "object") {
      const a = (v as { address?: string; email?: string }).address ?? (v as { email?: string }).email;
      if (a) out.push(a);
    }
  };
  for (const f of fields) (Array.isArray(f) ? f : [f]).forEach(push);
  return out.map((a) => a.match(/<([^<>]+@[^<>]+)>/)?.[1]?.trim() ?? a.trim()).filter(Boolean);
}

/** The domain we own the mailbox side of: mail sent here has to go somewhere a
 *  person reads. Falls back to the first inbound domain. */
function forwardDomain(): string {
  return (process.env.INBOUND_FORWARD_DOMAIN || "hellomutuals.com").toLowerCase();
}

/** Where mail to that domain that carries no invite token ends up. Without this
 *  the From address on every outbound email is a black hole: the MX accepts the
 *  message, no token matches, and the reply is dropped. Somebody writing back to
 *  `hello@hellomutuals.com` has to reach a human, and the DMARC aggregate
 *  reports addressed to `dmarc@hellomutuals.com` have to land somewhere too. */
async function forwardToHuman(data: Record<string, unknown>, body: { text: string; html: string }) {
  const to = process.env.INBOUND_FORWARD_TO || "josh@shiftsupportnetwork.com";
  const sender = addressList(data.from)[0] || "unknown sender";
  // Never forward our own forward back to ourselves, and never forward a message
  // the forwarding mailbox itself sent: either one is a loop.
  if (sender.toLowerCase() === to.toLowerCase()) return;
  const originalTo = addressList(data.to).join(", ");
  const subject = String(data.subject ?? "(no subject)");
  const header =
    `Forwarded from ${originalTo || forwardDomain()}\n` +
    `From: ${sender}\nSubject: ${subject}\n\n`;
  const { sendEmail } = await import("@/lib/email");
  await sendEmail({
    to,
    subject: `[hellomutuals inbox] ${subject}`,
    text: header + (body.text || "(no text part)"),
    html:
      `<p style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:13px;color:#67635d">` +
      `Forwarded from ${originalTo || forwardDomain()}<br/>From: ${sender}</p><hr/>` +
      (body.html || `<pre>${body.text || "(no text part)"}</pre>`),
    replyTo: sender,
  });
}

// Fetch the full received message (the webhook carries metadata only) so we can
// read the reply body. Provider or database failures throw so Resend retries the
// signed webhook. The decision transition is atomic, so a retry is safe.
async function fetchReceivedBody(emailId: string): Promise<{ text: string; html: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !emailId) throw new Error("received email fetch is not configured");
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      signal: AbortSignal.timeout(12_000),
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
    // Both parts are returned. The parser prefers text and falls back to HTML,
    // which it converts with the quote containers removed rather than by
    // flattening every tag into a single line.
    return { text: j.text || "", html: j.html || "" };
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
    const domains = inboundDomains();
    if (!domains.length) return new Response("inbound domain not configured", { status: 503 });
    const token =
      tokenFromRecipients(data.to, domains) ||
      tokenFromRecipients(data.reply_to, domains) ||
      tokenFromRecipients((data.headers as Record<string, unknown> | undefined)?.["to"], domains);
    if (!token) {
      // No token, but addressed to our own domain: a person wrote to the From
      // address rather than replying to an invite. Forward it instead of
      // dropping it. Other projects share this account's inbound stream, so
      // anything on another domain is still ignored without a body fetch.
      const ours = addressList(data.to, (data.headers as Record<string, unknown> | undefined)?.["to"]).some(
        (a) => a.toLowerCase().endsWith("@" + forwardDomain()),
      );
      if (!ours) return new Response("no token", { status: 200 });
      let fwdText = String(data.text ?? "");
      let fwdHtml = String(data.html ?? "");
      if (!fwdText.trim() && !fwdHtml.trim()) {
        const emailId = String(data.email_id ?? data.id ?? "");
        ({ text: fwdText, html: fwdHtml } = await fetchReceivedBody(emailId));
      }
      await forwardToHuman(data, { text: fwdText, html: fwdHtml });
      return new Response("forwarded", { status: 200 });
    }

    // Body only for our own messages. Prefer any inline parts, else fetch them.
    let bodyText = String(data.text ?? "");
    let bodyHtml = String(data.html ?? "");
    if (!bodyText.trim() && !bodyHtml.trim()) {
      const emailId = String(data.email_id ?? data.id ?? "");
      ({ text: bodyText, html: bodyHtml } = await fetchReceivedBody(emailId));
    }

    // The same `r+<token>@` address now carries two different conversations. A
    // recommendation reply is not a Y/N decision: the whole message IS the
    // answer, so it is routed before the decision parser ever sees it.
    //
    // This is the least work a vouch can be. No link, no page, no account: hit
    // reply, type, done. It reuses the webhook, the signature check, and the
    // quoted-history stripping that the match invites already proved against 51
    // real client shapes, rather than rebuilding any of it.
    const recommendation = await prisma.recommendation.findUnique({
      where: { token },
      select: { id: true, status: true },
    });
    if (recommendation) {
      if (recommendation.status !== "requested" && recommendation.status !== "endorsed") {
        return new Response("already answered", { status: 200 });
      }
      const prose = stripQuotedHistory(
        bodyText.trim() ? bodyText : htmlToReplyText(bodyHtml),
      ).trim();
      // Too short to be a recommendation is not a reason to guess. The page and
      // the one-tap vouch are both still open, and the nudges still run.
      if (prose.length < 40) return new Response("too short", { status: 200 });
      const answer = await recordAnswer(token, { body: prose });
      if (!answer.ok) return new Response("closed", { status: 200 });
      await afterRecommendationAnswer(token, answer);
      return new Response("ok", { status: 200 });
    }

    // Anything ambiguous, automated, or empty comes back null and is ignored:
    // the invite's Yes/Pass buttons remain, and the match stays pending. Never
    // downgrade an unreadable reply to a decision.
    const decision = decisionFromReply(bodyText, bodyHtml);
    if (!decision) return new Response("no decision", { status: 200 });

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
