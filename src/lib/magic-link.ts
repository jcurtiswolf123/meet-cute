import { headers } from "next/headers";
import { prisma } from "./prisma";
import { createLoginCode, createLoginToken, normalizeEmail, purgeExpiredAuth } from "./auth";
import { sendEmail, magicLinkEmail, signInLinkUnusedEmail } from "./email";
import { queueEmailDelivery, makeDeliveryKey } from "./delivery";
import { SIGNIN_RECOVERY_DELAY_MS } from "./recommendations";
import { rateLimit } from "./ratelimit";

// Sending a sign-in link, once, for every transport that asks for one.
//
// There are two now: the `/login` form (a server action that redirects) and
// `/api/mobile/login` (JSON, because the iOS shell draws its own sign-in
// screen). The rate limits, the refusal to trust the Host header, and the
// unused-link follow-up are all security-relevant, so they live here rather
// than being copied into the second caller and drifting from the first.

export type MagicLinkOutcome = "sent" | "email" | "throttled" | "send";

/** The origin an emailed link may point at.
 *
 *  Never the Host header in production: a forged Host would put the token on an
 *  attacker's domain, which is account takeover. `NEXT_PUBLIC_APP_URL` is
 *  required there; the request host is a local-dev convenience only. */
export async function magicLinkBase(): Promise<string | null> {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") return null;
  const h = await headers();
  return `http://${h.get("host") || "localhost:3009"}`;
}

/** The caller's address, preferring the proxy header Fly actually sets. */
export async function requestIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  return (
    h.get("fly-client-ip") ||
    (xff ? xff.split(",").map((s) => s.trim()).filter(Boolean).at(-1) : "") ||
    h.get("x-real-ip") ||
    "anon"
  ).trim();
}

/**
 * Mail a one-time sign-in link. Returns which of the four things happened, so a
 * form can render the right message instead of claiming "check your email" for
 * a link that was never sent.
 */
export async function sendMagicLink(rawEmail: string): Promise<MagicLinkOutcome> {
  const email = normalizeEmail(rawEmail);
  const base = await magicLinkBase();
  const ip = await requestIp();

  // Per-IP and per-email caps stop inbox-bombing a victim and burning the mail
  // provider's quota. (In-memory; single instance. Swap to Upstash for multi.)
  const validEmail = email.includes("@") && email.length <= 254;
  const ipOk = (await rateLimit(`magic:ip:${ip}`, 10, 60 * 60 * 1000)).ok;
  const emailOk = validEmail && (await rateLimit(`magic:email:${email}`, 3, 15 * 60 * 1000)).ok;

  if (!validEmail) return "email";
  if (!ipOk || !emailOk) return "throttled";
  if (!base) {
    console.error("[auth] NEXT_PUBLIC_APP_URL must be set in production to send magic links");
    return "send";
  }

  let outcome: MagicLinkOutcome = "sent";
  const token = await createLoginToken(email);
  const link = `${base}/auth/verify?token=${encodeURIComponent(token)}`;
  // A code as well as a link: on a phone with Mutuals on the home screen, or in
  // the iOS shell, the link signs Safari in and leaves the app signed out. See
  // createLoginCode.
  const code = await createLoginCode(email);
  const { subject, html, text } = magicLinkEmail(link, code);
  const result = await sendEmail({ to: email, subject, html, text });
  if (!result.ok) {
    console.error("[auth] magic link send failed:", result.error);
    outcome = "send";
  }

  // The last hole in the funnel: an unused link. Queued now, due in three
  // hours, and withdrawn the moment they sign in. The address is already ours
  // and they asked for it themselves; until this existed they were invisible,
  // because a Person row is only created when a link is clicked.
  //
  // Keyed on the address alone, so asking for three links in a row still
  // produces at most one of these, ever.
  try {
    const existing = await prisma.person.findUnique({
      where: { email },
      select: { appliedAt: true },
    });
    if (!existing?.appliedAt) {
      const msg = signInLinkUnusedEmail({
        email,
        applyUrl: `${base}/apply?email=${encodeURIComponent(email)}`,
      });
      await queueEmailDelivery({
        kind: "signin_unused",
        to: email,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        idempotencyKey: makeDeliveryKey("signin_unused", email),
        availableAt: new Date(Date.now() + SIGNIN_RECOVERY_DELAY_MS),
      });
    }
  } catch (error) {
    console.error(
      `[auth] could not schedule the unused-link follow-up: ${(error as Error).message}`,
    );
  }

  void purgeExpiredAuth();
  return outcome;
}
