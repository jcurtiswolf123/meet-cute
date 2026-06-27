// Transactional SMS via Twilio's REST API (no SDK dependency).
//
// Degrades gracefully like email.ts: with no Twilio credentials (local dev), it
// logs the message to the server console and returns ok, so the intro flow is
// testable without sending real texts. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
// and TWILIO_FROM in production.
import { createHmac, timingSafeEqual } from "crypto";

type SendArgs = { to: string; body: string };

/** Normalize a raw phone string to E.164. Assumes US (+1) for 10-digit numbers.
 *  Returns null when there aren't enough digits to be a real number. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (hasPlus) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`; // bare US number
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`; // already includes a country code without the plus
}

/** Last 10 digits, for forgiving inbound-number matching against stored values. */
export function phoneKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/** Canonicalize an Instagram handle OR url into a profile URL. Lenient:
 *  "@sam"/"sam" -> "https://instagram.com/sam"; a full instagram.com URL is kept
 *  (adding https:// if missing); blank -> null. */
export function normalizeInstagram(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/instagram\.com/i.test(trimmed)) {
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, "")}`;
  }
  const handle = trimmed.replace(/^@+/, "").replace(/\s+/g, "");
  if (!handle) return null;
  return `https://instagram.com/${handle}`;
}

/** Canonicalize a LinkedIn handle OR url into a profile URL. Lenient: a bare
 *  handle ("@sam"/"sam") -> "https://www.linkedin.com/in/sam"; a full
 *  linkedin.com URL is kept (adding https:// if missing); blank -> null. */
export function normalizeLinkedin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/linkedin\.com/i.test(trimmed)) {
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, "")}`;
  }
  const handle = trimmed.replace(/^@+/, "").replace(/\s+/g, "");
  if (!handle) return null;
  return `https://www.linkedin.com/in/${handle}`;
}

export async function sendSMS({ to, body }: SendArgs): Promise<{ ok: boolean }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  const e164 = normalizePhone(to);

  if (!e164) {
    console.error("[sms] no valid destination number; skipping send");
    return { ok: false };
  }

  if (!sid || !token || !from) {
    // In production a missing credential is a misconfiguration: fail loudly so a
    // broken intro is visible, never silently "succeed".
    if (process.env.NODE_ENV === "production") {
      console.error("[sms] Twilio credentials not set; refusing to send in production");
      return { ok: false };
    }
    console.log(`[sms:dev] to=${e164} body="${body}"`);
    return { ok: true };
  }

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: e164, From: from, Body: body }).toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[sms] Twilio ${res.status}: ${text.slice(0, 300)}`);
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    console.error(`[sms] send failed: ${(e as Error).message}`);
    return { ok: false };
  }
}

/** Validate Twilio's X-Twilio-Signature over the request URL + sorted params.
 *  Returns true (skip) in dev when no auth token is configured. */
export function verifyTwilioSignature(args: {
  signature: string | null;
  url: string;
  params: Record<string, string>;
}): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return process.env.NODE_ENV !== "production"; // dev: allow; prod: deny
  if (!args.signature) return false;

  const data = Object.keys(args.params)
    .sort()
    .reduce((acc, key) => acc + key + args.params[key], args.url);
  const expected = createHmac("sha1", token).update(Buffer.from(data, "utf-8")).digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(args.signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

function first(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** Turn an operator's newline-separated "about" text into inline SMS bullets.
 *  "Works in finance\nLives in Brooklyn" -> "- Works in finance - Lives in Brooklyn".
 *  Strips any bullet character the operator typed and drops empty lines. Returns
 *  "" when there is nothing to show. SMS is plain text, so we use "- " markers.
 *  Mirrored inline in IntroComposer.tsx (this module is server-only). */
export function aboutBullets(about?: string | null): string {
  if (!about) return "";
  const lines = about
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);
  return lines.map((l) => `- ${l}`).join(" ");
}

/** "Want an intro?" text sent to each side when the operator starts an intro.
 *  `about` is the bullet text describing the OTHER person (shown to this
 *  recipient); `blurb` is the optional extra one-liner (Match.rationale). */
export function introInviteSMS(args: {
  toName: string;
  otherName: string;
  about?: string | null;
  otherInstagram?: string | null;
  blurb?: string | null;
  operatorName: string;
}): string {
  const me = first(args.operatorName);
  const them = first(args.otherName);
  const bullets = aboutBullets(args.about);
  // The recipient can size the other person up on Instagram before deciding.
  const ig = normalizeInstagram(args.otherInstagram);
  const blurb = args.blurb?.trim();
  return [
    `Hi ${first(args.toName)}, it's ${me} (your matchmaker).`,
    `I think you'd hit it off with ${them}.`,
    bullets ? `A bit about them: ${bullets}.` : null,
    ig ? `Take a look: ${ig}.` : null,
    blurb ? blurb : null,
    `Want me to introduce you two? Reply Y for yes or N for no.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** First message dropped into the 3-way group thread once both say yes. */
export function groupIntroSMS(args: { operatorName: string; aName: string; bName: string }): string {
  const me = first(args.operatorName);
  const a = first(args.aName);
  const b = first(args.bName);
  return `You both said yes! ${a}, meet ${b}. ${b}, meet ${a}. I'll let you two take it from here - I'm right here if you need me. - ${me}`;
}

/** Sent to each side once both have said yes: hands off with the other's number. */
export function connectedSMS(args: { toName: string; otherName: string; otherPhone: string }): string {
  return [
    `Great news ${first(args.toName)} - ${first(args.otherName)} said yes too!`,
    `Here's ${first(args.otherName)}'s number: ${args.otherPhone}.`,
    `I've let them know you'll be in touch. Take it from here.`,
  ].join(" ");
}

/** Follow-up after a connection: asks for feedback the operator can act on. */
export function feedbackRequestSMS(args: { toName: string; otherName: string; operatorName: string }): string {
  return [
    `Hi ${first(args.toName)}, it's ${first(args.operatorName)}.`,
    `How did things go with ${first(args.otherName)}?`,
    `Just reply to this text - anything helps me make better introductions for you.`,
  ].join(" ");
}

// --- group MMS (3-way intro thread) -----------------------------------------
//
// Twilio Conversations "group texting": our single Twilio number is added to the
// Conversation as a standalone projected address (the group's mask / sender),
// and each real phone joins by its own number via MessagingBinding.Address. The
// result is one native group MMS thread where every member sees every other
// member, and the intro message is authored by (appears to come from) our line.
//
// Carrier constraints to know: Group MMS is US/Canada (+1) only, capped at 10
// participants, and the Twilio account must have Group MMS enabled (otherwise
// Twilio returns error 50452). We talk to the REST API directly to avoid adding
// the Twilio SDK, matching sendSMS above. This never throws; callers fall back
// to brokering numbers on { ok: false }.
const CONVERSATIONS_BASE = "https://conversations.twilio.com/v1";

export type GroupConversationResult =
  | { ok: true; conversationSid: string | null }
  | { ok: false; reason: string };

type TwilioCreds = { sid: string; token: string; auth: string };

function twilioCreds(): TwilioCreds | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return { sid, token, auth: Buffer.from(`${sid}:${token}`).toString("base64") };
}

async function conversationsPost(
  creds: TwilioCreds,
  path: string,
  form: Record<string, string>,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown>; text: string }> {
  const res = await fetch(`${CONVERSATIONS_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds.auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form).toString(),
  });
  const text = await res.text().catch(() => "");
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    /* non-JSON error body; keep the raw text for logging */
  }
  return { ok: res.ok, status: res.status, json, text };
}

/** Create a Twilio group-MMS Conversation between several phone numbers, masked
 *  behind our single Twilio number, and send `body` as the opening message.
 *
 *  - `participants`: real phone numbers to add to the group (operator + both
 *    applicants). Normalized to E.164; the proxy/group number itself is skipped
 *    if present, and duplicates are removed.
 *  - `operatorAddress`: our Twilio number, used as the group's projected (proxy)
 *    address and as the message author. Defaults to TWILIO_FROM.
 *
 *  Degrades like sendSMS: with no Twilio credentials it logs and returns ok in
 *  dev (so the flow proceeds), and refuses with { ok: false } in production. */
export async function createGroupConversation(args: {
  participants: string[];
  operatorAddress?: string | null;
  body: string;
  friendlyName?: string;
}): Promise<GroupConversationResult> {
  const proxy = normalizePhone(args.operatorAddress ?? process.env.TWILIO_FROM ?? null);
  const numbers = Array.from(
    new Set(
      args.participants
        .map((p) => normalizePhone(p))
        .filter((p): p is string => !!p && p !== proxy),
    ),
  );

  if (numbers.length < 2) {
    return { ok: false, reason: "need at least two distinct participant numbers" };
  }
  if (numbers.length + 1 > 10) {
    return { ok: false, reason: "group MMS supports at most 10 participants" };
  }

  const creds = twilioCreds();
  if (!creds || !proxy) {
    if (process.env.NODE_ENV === "production") {
      console.error("[sms] Twilio credentials/number not set; cannot create group MMS in production");
      return { ok: false, reason: "twilio not configured" };
    }
    console.log(`[sms:dev] group MMS proxy=${proxy ?? "(unset)"} participants=${numbers.join(",")} body="${args.body}"`);
    return { ok: true, conversationSid: null };
  }

  let conversationSid: string | null = null;
  try {
    // 1) Create the Conversation. friendlyName must avoid PII (Twilio guidance),
    //    so we use a pseudonymized label, never names or numbers.
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
    const created = await conversationsPost(creds, "/Conversations", {
      FriendlyName: args.friendlyName?.slice(0, 200) || "meet-cute-intro",
      ...(messagingServiceSid ? { MessagingServiceSid: messagingServiceSid } : {}),
    });
    if (!created.ok || typeof created.json.sid !== "string") {
      return { ok: false, reason: `create conversation failed (${created.status}): ${created.text.slice(0, 200)}` };
    }
    conversationSid = created.json.sid;

    // 2) Add our number as the standalone projected address (the group mask).
    const proxyAdd = await conversationsPost(creds, `/Conversations/${conversationSid}/Participants`, {
      "MessagingBinding.ProjectedAddress": proxy,
    });
    if (!proxyAdd.ok) {
      await deleteConversation(creds, conversationSid);
      return { ok: false, reason: `add projected address failed (${proxyAdd.status}): ${proxyAdd.text.slice(0, 200)}` };
    }

    // 3) Add each real phone by its own address (no proxy needed for group MMS).
    for (const number of numbers) {
      const added = await conversationsPost(creds, `/Conversations/${conversationSid}/Participants`, {
        "MessagingBinding.Address": number,
      });
      if (!added.ok) {
        await deleteConversation(creds, conversationSid);
        return { ok: false, reason: `add participant failed (${added.status}): ${added.text.slice(0, 200)}` };
      }
    }

    // 4) Send the opening message, authored by our projected number so it lands
    //    as a group MMS that everyone (including the operator) can see and reply to.
    const sent = await conversationsPost(creds, `/Conversations/${conversationSid}/Messages`, {
      Author: proxy,
      Body: args.body,
    });
    if (!sent.ok) {
      await deleteConversation(creds, conversationSid);
      return { ok: false, reason: `send group message failed (${sent.status}): ${sent.text.slice(0, 200)}` };
    }

    return { ok: true, conversationSid };
  } catch (e) {
    if (conversationSid) await deleteConversation(creds, conversationSid);
    return { ok: false, reason: `group MMS error: ${(e as Error).message}` };
  }
}

/** Best-effort teardown of a half-built Conversation so a failed attempt does
 *  not leave an orphaned thread (or block a retry with the same participants). */
async function deleteConversation(creds: TwilioCreds, sid: string): Promise<void> {
  try {
    await fetch(`${CONVERSATIONS_BASE}/Conversations/${sid}`, {
      method: "DELETE",
      headers: { Authorization: `Basic ${creds.auth}` },
    });
  } catch {
    /* cleanup is best-effort */
  }
}
