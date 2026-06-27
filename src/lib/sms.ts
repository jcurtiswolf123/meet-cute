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

/** "Want an intro?" text sent to each side when the operator starts an intro. */
export function introInviteSMS(args: {
  toName: string;
  otherName: string;
  blurb?: string | null;
  operatorName: string;
}): string {
  const me = first(args.operatorName);
  const them = first(args.otherName);
  const blurb = args.blurb?.trim();
  return [
    `Hi ${first(args.toName)}, it's ${me} (your matchmaker).`,
    `I think you'd really hit it off with ${them}.`,
    blurb ? blurb : null,
    `Want me to introduce you two? Reply Y for yes or N for no.`,
  ]
    .filter(Boolean)
    .join(" ");
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
