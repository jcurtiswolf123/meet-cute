import { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import { verifyTwilioSignature, normalizePhone, phoneKey } from "@/lib/sms";
import { logIntroMessage } from "@/lib/introductions";

export const dynamic = "force-dynamic";

// Twilio Conversations webhook for the 3-way intro group threads.
//
// Configure on the Conversations Service (or the Messaging Service used for the
// group): set the post-event webhook for `onMessageAdded` to
//   POST {NEXT_PUBLIC_APP_URL}/api/sms/conversations
//
// We use this purely for VISIBILITY: every message in a group thread is logged
// to the match's IntroMessage transcript so the operator console can show the
// conversation and its health. The bot does NOT auto-reply here - by design it
// makes the introduction, suggests a first step, then steps back. The operator
// (who is in the thread on their own cell) can jump in any time.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;

  const url = `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || `https://${req.headers.get("host")}`}/api/sms/conversations`;
  const valid = verifyTwilioSignature({ signature: req.headers.get("x-twilio-signature"), url, params });
  if (!valid) return new Response("invalid signature", { status: 403 });

  // We only act on a new message landing in a conversation we own.
  const eventType = params.EventType || params.eventType || "";
  if (eventType && eventType !== "onMessageAdded") return ok();

  const conversationSid = params.ConversationSid || params.conversationSid || "";
  const body = (params.Body || params.body || "").trim();
  const author = params.Author || params.author || ""; // E.164 of the sender, or our proxy
  if (!conversationSid || !body) return ok();

  try {
    const match = await prisma.match.findFirst({
      where: { conversationSid },
      include: {
        personA: { select: { id: true, name: true, phone: true } },
        personB: { select: { id: true, name: true, phone: true } },
      },
    });
    if (!match) return ok();

    // Our own number (the projected group address) authors the bot/operator
    // messages we already log out-of-band, so skip those to avoid duplicates.
    const proxy = normalizePhone(process.env.TWILIO_FROM ?? null);
    const authorE164 = normalizePhone(author);
    if (proxy && authorE164 === proxy) return ok();

    // Attribute the message to whichever participant sent it.
    const key = phoneKey(author);
    let person: { id: string; name: string } | null = null;
    for (const p of [match.personA, match.personB]) {
      if (p.phone && (normalizePhone(p.phone) === authorE164 || phoneKey(p.phone) === key)) {
        person = { id: p.id, name: p.name };
        break;
      }
    }

    await logIntroMessage({
      matchId: match.id,
      body,
      direction: "in",
      author: person ? person.name.split(" ")[0] : "member",
      personId: person?.id ?? null,
      kind: "group",
    });
  } catch (e) {
    // Visibility logging must never break the webhook; surface to Sentry instead.
    Sentry.captureException(e);
    console.error(`[conversations] log failed: ${(e as Error).message}`);
  }

  return ok();
}

// Twilio post-event webhooks just need a 2xx; no body required.
function ok(): Response {
  return new Response(null, { status: 204 });
}
