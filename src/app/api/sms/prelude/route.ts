import { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import { phoneKey, verifyPreludeSignature } from "@/lib/sms";

export const dynamic = "force-dynamic";

// Prelude webhook. Two event families land here:
//
//   transactional.message.*   delivery lifecycle for a Notify send
//   subscription.*            STOP / START / HELP, handled by Prelude's
//                             subscription management on our behalf
//
// Configure the delivery events per-send with PRELUDE_CALLBACK_URL, which
// sms.ts passes as `callback_url`. Subscription management is switched on by
// Prelude's Customer Success team, not self-serve, and until it is there is no
// opt-out signal on this provider at all. That is a compliance gate, not a
// nice-to-have: see docs/SMS-PRELUDE.md.
//
//   POST https://hellomeetcute.com/api/sms/prelude
//
// Unlike Twilio and Telnyx this endpoint never carries an inbound member reply.
// Prelude's inbound events are WhatsApp only, and we do not run WhatsApp, so a
// member's Y/N decision always comes from the token-gated page or an email
// reply. Nothing here should ever try to advance an introduction.

type PreludeEvent = {
  id?: string;
  type?: string;
  payload?: Record<string, unknown>;
  created_at?: string;
};

function ok(): Response {
  // Prelude retries with exponential backoff for up to two weeks on anything
  // that is not a 200, so acknowledge everything we have durably handled.
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  const rawBody = await req.text();
  const signature = req.headers.get("x-webhook-signature");
  const isProd = process.env.NODE_ENV === "production";

  // Fail closed in production once a signing key exists. Without a key we would
  // be accepting unauthenticated opt-out events from anyone who finds the URL.
  if (isProd) {
    if (!process.env.PRELUDE_WEBHOOK_PUBLIC_KEY) {
      // Rejecting is right, but doing it quietly is not. Once Prelude enables
      // subscription management, an unset key turns every STOP into a 401 that
      // nobody sees, and we keep texting people who opted out. Page on it.
      console.error("[prelude] PRELUDE_WEBHOOK_PUBLIC_KEY is not set; rejecting webhook");
      Sentry.captureMessage(
        "Prelude webhook rejected: PRELUDE_WEBHOOK_PUBLIC_KEY is not set. If this is a subscription event, an opt-out is being dropped.",
        "error",
      );
      return new Response("unauthorized", { status: 401 });
    }
    if (!verifyPreludeSignature({ signature, rawBody })) {
      console.error("[prelude] webhook signature verification failed");
      // A genuine Prelude event failing verification means a key mismatch, and
      // the same opt-out-dropping consequence. A hostile probe looks identical
      // from here, so this is a warning rather than an error.
      Sentry.captureMessage("Prelude webhook signature verification failed", "warning");
      return new Response("unauthorized", { status: 401 });
    }
  }

  let event: PreludeEvent | null = null;
  try {
    event = JSON.parse(rawBody) as PreludeEvent;
  } catch {
    // A body we cannot parse will never parse on retry.
    console.error("[prelude] webhook body was not JSON");
    return ok();
  }

  const type = typeof event?.type === "string" ? event.type : "";
  const payload = (event?.payload ?? {}) as Record<string, unknown>;

  try {
    if (type.startsWith("subscription.")) {
      await handleSubscriptionEvent(type, payload);
      return ok();
    }
    if (type.startsWith("transactional.message.")) {
      await handleDeliveryEvent(type, payload);
      return ok();
    }
    if (type === "inbound.message.received") {
      // WhatsApp only, and we do not run a WhatsApp number. Record it rather
      // than silently dropping, so switching WhatsApp on later is visible.
      console.warn("[prelude] ignoring inbound message event; WhatsApp is not enabled");
      return ok();
    }
  } catch (err) {
    Sentry.captureException(err);
    console.error(`[prelude] failed handling ${type}: ${(err as Error).message}`);
    // Let Prelude retry: the event was authentic and we failed to store it.
    return new Response("error", { status: 500 });
  }

  return ok();
}

/** STOP / START from Prelude's subscription management. Mirrors what the Twilio
 *  inbound route does with the same keywords, writing the same column, so the
 *  member's consent state means one thing regardless of provider. */
async function handleSubscriptionEvent(
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const raw = typeof payload.phone_number === "string" ? payload.phone_number : null;
  const key = phoneKey(raw);
  if (!key) {
    console.warn(`[prelude] ${type} carried no usable phone number`);
    return;
  }

  // Prelude spells the terminal states differently across event names and a
  // `status` field, so decide on both rather than on one shape.
  const status = typeof payload.status === "string" ? payload.status.toLowerCase() : "";
  const optedOut = type.includes("unsubscribe") || status === "unsubscribed" || status === "stop";
  const optedIn = type.includes("subscribe") && !optedOut;

  if (!optedOut && !optedIn) return;

  const people = await prisma.person.findMany({
    where: { phone: { not: null } },
    select: { id: true, phone: true },
  });
  const matches = people.filter((p) => phoneKey(p.phone) === key).map((p) => p.id);
  if (!matches.length) return;

  await prisma.person.updateMany({
    where: { id: { in: matches } },
    data: { smsConsentAt: optedOut ? null : new Date() },
  });
  console.log(`[prelude] ${optedOut ? "opt-out" : "opt-in"} applied to ${matches.length} member(s)`);
}

/** Delivery lifecycle. The outbox already owns retries, so this is recorded for
 *  operator visibility rather than used to re-drive a send. */
async function handleDeliveryEvent(
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const status = type.replace("transactional.message.", "");
  const reason = typeof payload.reason === "string" ? payload.reason : null;
  if (status === "failed" || status === "unknown") {
    console.error(`[prelude] delivery ${status}${reason ? `: ${reason}` : ""}`);
    return;
  }
  console.log(`[prelude] delivery ${status}`);
}
