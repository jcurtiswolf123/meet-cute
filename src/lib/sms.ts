// Transactional SMS via Twilio OR Telnyx REST APIs (no SDK dependency).
//
// Provider is selected by SMS_PROVIDER ("twilio" | "telnyx", default "twilio").
// This lets us flip carriers with an env var while Twilio remains the fallback:
//   - Twilio:  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
//   - Telnyx:  TELNYX_API_KEY, TELNYX_FROM, TELNYX_MESSAGING_PROFILE_ID,
//              TELNYX_PUBLIC_KEY (base64 Ed25519, for inbound signature verify)
//
// Degrades gracefully like email.ts: with no credentials (local dev), it logs the
// message to the server console and returns ok, so the intro flow is testable
// without sending real texts.
//
// NOTE on group MMS: the 3-way group intro (createGroupConversation below) uses
// Twilio Conversations "projected address" masking, which has NO Telnyx
// equivalent. Under SMS_PROVIDER=telnyx that path returns { ok: false } so the
// caller falls back to brokering numbers (connectedSMS). 1:1 SMS (the Y/N invite
// flow, opt-out, feedback) works fully on either provider.
import { createHmac, timingSafeEqual, createPublicKey, verify as edVerify } from "crypto";

type SendArgs = { to: string; body: string };
export type SmsSendResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; retryable: boolean; error: string };

/** Which carrier to send through. Twilio is the default/fallback. */
export function smsProvider(): "twilio" | "telnyx" {
  return process.env.SMS_PROVIDER === "telnyx" ? "telnyx" : "twilio";
}

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

export async function sendSMS({ to, body }: SendArgs): Promise<SmsSendResult> {
  const e164 = normalizePhone(to);
  if (!e164) {
    console.error("[sms] no valid destination number; skipping send");
    return { ok: false, retryable: false, error: "invalid destination number" };
  }
  return smsProvider() === "telnyx" ? sendViaTelnyx(e164, body) : sendViaTwilio(e164, body);
}

async function sendViaTwilio(e164: string, body: string): Promise<SmsSendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;

  if (!sid || !token || !from) {
    // In production a missing credential is a misconfiguration: fail loudly so a
    // broken intro is visible, never silently "succeed".
    if (process.env.NODE_ENV === "production") {
      console.error("[sms] Twilio credentials not set; refusing to send in production");
      return { ok: false, retryable: false, error: "Twilio is not configured" };
    }
    console.log(`[sms:dev] (twilio) to=${e164} body="${body}"`);
    return { ok: true, providerMessageId: "dev" };
  }

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      signal: AbortSignal.timeout(12_000),
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: e164, From: from, Body: body }).toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[sms] Twilio ${res.status}: ${text.slice(0, 300)}`);
      return {
        ok: false,
        retryable: res.status === 429,
        error: `Twilio returned ${res.status}`,
      };
    }
    const payload = (await res.json().catch(() => ({}))) as { sid?: unknown };
    return {
      ok: true,
      ...(typeof payload.sid === "string" ? { providerMessageId: payload.sid } : {}),
    };
  } catch (e) {
    console.error(`[sms] send failed: ${(e as Error).message}`);
    return {
      ok: false,
      retryable: false,
      error: `Twilio outcome unknown: ${(e as Error).message}`,
    };
  }
}

async function sendViaTelnyx(e164: string, body: string): Promise<SmsSendResult> {
  const apiKey = process.env.TELNYX_API_KEY;
  const from = process.env.TELNYX_FROM;
  const profileId = process.env.TELNYX_MESSAGING_PROFILE_ID;

  // Telnyx accepts either an explicit `from` number or a `messaging_profile_id`
  // (which lets Telnyx pick the sending number / number pool). Require at least
  // one alongside the API key.
  if (!apiKey || (!from && !profileId)) {
    if (process.env.NODE_ENV === "production") {
      console.error("[sms] Telnyx credentials not set; refusing to send in production");
      return { ok: false, retryable: false, error: "Telnyx is not configured" };
    }
    console.log(`[sms:dev] (telnyx) to=${e164} body="${body}"`);
    return { ok: true, providerMessageId: "dev" };
  }

  try {
    const payload: Record<string, string> = { to: e164, text: body };
    if (from) payload.from = from;
    if (profileId) payload.messaging_profile_id = profileId;

    const res = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      signal: AbortSignal.timeout(12_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[sms] Telnyx ${res.status}: ${text.slice(0, 300)}`);
      return {
        ok: false,
        retryable: res.status === 429,
        error: `Telnyx returned ${res.status}`,
      };
    }
    const response = (await res.json().catch(() => ({}))) as {
      data?: { id?: unknown };
    };
    return {
      ok: true,
      ...(typeof response.data?.id === "string"
        ? { providerMessageId: response.data.id }
        : {}),
    };
  } catch (e) {
    console.error(`[sms] send failed: ${(e as Error).message}`);
    return {
      ok: false,
      retryable: false,
      error: `Telnyx outcome unknown: ${(e as Error).message}`,
    };
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

/** Wrap a raw 32-byte Ed25519 public key (Telnyx gives it base64) in SPKI DER so
 *  Node's crypto can build a KeyObject. The 12-byte prefix is the fixed ASN.1
 *  header for an Ed25519 SubjectPublicKeyInfo. */
function telnyxPublicKey(): ReturnType<typeof createPublicKey> | null {
  const b64 = process.env.TELNYX_PUBLIC_KEY;
  if (!b64) return null;
  try {
    const raw = Buffer.from(b64, "base64");
    if (raw.length !== 32) return null; // not a raw Ed25519 key
    const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
    return createPublicKey({ key: Buffer.concat([spkiPrefix, raw]), format: "der", type: "spki" });
  } catch {
    return null;
  }
}

/** Verify a Telnyx webhook: Ed25519 signature over `timestamp|rawBody`, sent in
 *  the `telnyx-signature-ed25519` (base64) + `telnyx-timestamp` headers. Also
 *  rejects timestamps older than `toleranceSecs` (default 5 min) to stop replay.
 *  Returns true (skip) in dev when no public key is configured; denies in prod. */
export function verifyTelnyxSignature(args: {
  signature: string | null;
  timestamp: string | null;
  rawBody: string;
  nowSecs: number;
  toleranceSecs?: number;
}): boolean {
  const key = telnyxPublicKey();
  if (!key) return process.env.NODE_ENV !== "production"; // dev: allow; prod: deny
  if (!args.signature || !args.timestamp) return false;

  const ts = Number(args.timestamp);
  if (!Number.isFinite(ts)) return false;
  const tolerance = args.toleranceSecs ?? 300;
  if (Math.abs(args.nowSecs - ts) > tolerance) return false; // stale / replayed

  try {
    const signed = Buffer.from(`${args.timestamp}|${args.rawBody}`, "utf-8");
    return edVerify(null, signed, key, Buffer.from(args.signature, "base64"));
  } catch {
    return false;
  }
}

// --- carrier-required keyword handling (STOP / HELP / START) -----------------
//
// US A2P 10DLC rules require that STOP ends messaging and HELP returns help info
// for ANY inbound number, whether or not it maps to a person. We match these as
// leading whole words so an ordinary reply ("no, stop by later") is not misread,
// and keep the exact reply copy here so it stays consistent and reviewable. For
// durable, account-wide suppression of opted-out numbers, send via a Twilio
// Messaging Service with Advanced Opt-Out enabled (TWILIO_MESSAGING_SERVICE_SID),
// which blocks further sends automatically; this webhook copy is the fallback.
const STOP_KEYWORDS = /^\s*(stop|stopall|unsubscribe|cancel|end|quit|optout|opt[-\s]?out|revoke)\b/i;
const HELP_KEYWORDS = /^\s*(help|info)\b/i;
const START_KEYWORDS = /^\s*(start|unstop|optin|opt[-\s]?in|subscribe)\b/i;

export function isStopKeyword(body: string): boolean {
  return STOP_KEYWORDS.test(body);
}
export function isHelpKeyword(body: string): boolean {
  return HELP_KEYWORDS.test(body);
}
export function isStartKeyword(body: string): boolean {
  return START_KEYWORDS.test(body);
}

/** Reply sent when someone texts STOP: confirms opt-out and how to return. */
export const OPT_OUT_REPLY =
  "You're opted out and won't get more Meet Cute texts. Reply START to opt back in.";
/** Reply sent when someone texts HELP. */
export const HELP_REPLY =
  "Meet Cute matchmaking. We text intro invites you can accept (Y) or decline (N). Msg & data rates may apply. Reply STOP to opt out.";
/** Reply sent when someone texts START to re-subscribe. */
export const OPT_IN_REPLY =
  "You're opted back in to Meet Cute texts. Reply STOP any time to opt out.";

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
    // Carrier-required opt-out disclosure on the first message a recipient gets.
    `Reply STOP to opt out.`,
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
    signal: AbortSignal.timeout(12_000),
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
  // Group-MMS masking is a Twilio Conversations feature with no Telnyx analog.
  // Under Telnyx we decline so the caller falls back to brokering numbers.
  if (smsProvider() === "telnyx") {
    return { ok: false, reason: "group MMS unavailable on Telnyx; broker numbers instead" };
  }
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

/** Send a message into an existing group Conversation (operator "jump in").
 *  Authored by our projected number so it lands in the same group thread. Mirrors
 *  sendSMS' graceful degradation: logs and returns ok in dev with no creds,
 *  refuses in production. */
export async function sendConversationMessage(args: {
  conversationSid: string;
  body: string;
}): Promise<{ ok: boolean; reason?: string }> {
  if (smsProvider() === "telnyx") {
    return { ok: false, reason: "group conversations unavailable on Telnyx" };
  }
  const creds = twilioCreds();
  const proxy = normalizePhone(process.env.TWILIO_FROM ?? null);
  if (!creds) {
    if (process.env.NODE_ENV === "production") {
      console.error("[sms] Twilio credentials not set; cannot send group message in production");
      return { ok: false, reason: "twilio not configured" };
    }
    console.log(`[sms:dev] group message convo=${args.conversationSid} body="${args.body}"`);
    return { ok: true };
  }
  try {
    const sent = await conversationsPost(creds, `/Conversations/${args.conversationSid}/Messages`, {
      ...(proxy ? { Author: proxy } : {}),
      Body: args.body,
    });
    if (!sent.ok) return { ok: false, reason: `send failed (${sent.status}): ${sent.text.slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `group message error: ${(e as Error).message}` };
  }
}

/** Best-effort teardown of a half-built Conversation so a failed attempt does
 *  not leave an orphaned thread (or block a retry with the same participants). */
async function deleteConversation(creds: TwilioCreds, sid: string): Promise<void> {
  try {
    await fetch(`${CONVERSATIONS_BASE}/Conversations/${sid}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(12_000),
      headers: { Authorization: `Basic ${creds.auth}` },
    });
  } catch {
    /* cleanup is best-effort */
  }
}
