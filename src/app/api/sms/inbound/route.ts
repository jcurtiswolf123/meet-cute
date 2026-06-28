import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  phoneKey,
  normalizePhone,
  verifyTwilioSignature,
  isStopKeyword,
  isHelpKeyword,
  isStartKeyword,
  OPT_OUT_REPLY,
  HELP_REPLY,
  OPT_IN_REPLY,
} from "@/lib/sms";
import { recordIntroDecision } from "@/lib/introductions";

export const dynamic = "force-dynamic";

// Twilio inbound-SMS webhook. Twilio POSTs application/x-www-form-urlencoded with
// From (the texter) and Body (their message). We parse a Y/N reply, map it to the
// person's pending introduction, and connect them when both have said yes.
//
// Configure Twilio: Messaging > the number > "A message comes in" ->
//   POST  https://hellomeetcute.com/api/sms/inbound
//
// Replies are returned as TwiML; the actual confirmation/connection texts are
// sent out-of-band via the REST API so we fully control wording and timing.
function twiml(message?: string): Response {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new Response(body, { headers: { "Content-Type": "text/xml" } });
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

const YES = /^\s*(y|ye|yes|yeah|yep|yup|sure|ok|okay|absolutely|sounds good|do it)\b/i;
// STOP/unsubscribe/cancel are handled by the carrier-keyword branch below (a real
// opt-out), not lumped in here as a one-off "pass".
const NO = /^\s*(n|no|nope|nah|pass)\b/i;

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;

  // Verify the request really came from Twilio (HMAC over URL + sorted params).
  const url = `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || `https://${req.headers.get("host")}`}/api/sms/inbound`;
  const valid = verifyTwilioSignature({ signature: req.headers.get("x-twilio-signature"), url, params });
  if (!valid) {
    return new Response("invalid signature", { status: 403 });
  }

  const from = params.From || "";
  const body = (params.Body || "").trim();

  // Carrier-required keyword replies take precedence over intro Y/N parsing and
  // must work for any inbound number, matched to a person or not.
  if (isHelpKeyword(body)) return twiml(HELP_REPLY);
  if (isStartKeyword(body)) return twiml(OPT_IN_REPLY);
  if (isStopKeyword(body)) {
    await applyOptOut(from);
    return twiml(OPT_OUT_REPLY);
  }

  const key = phoneKey(from);
  if (!key) return twiml();

  // Match the inbound number to a person. Prefer the exact normalized E.164, and
  // only fall back to the last-10-digits substring when no exact row exists (so a
  // number stored in an odd format still resolves) — exact-first avoids attaching
  // a reply to the wrong person who merely shares 10 digits. If two people share a
  // number, the pending-intro check below picks the right one.
  const fromE164 = normalizePhone(from);
  // Only an EXACT E.164 match may record a Y/N decision. The broader last-10-digit
  // fallback below is used solely for non-consequential resolution (e.g. capturing
  // post-connection feedback), never to act on a reply, since a shared or spoofed
  // sender number could otherwise attach a decision to the wrong person.
  const exact = fromE164
    ? await prisma.person.findMany({ where: { phone: fromE164 }, select: { id: true, name: true } })
    : [];
  let candidates = exact;
  if (candidates.length === 0) {
    candidates = await prisma.person.findMany({
      where: { phone: { contains: key.slice(-10) } },
      select: { id: true, name: true },
    });
  }
  if (candidates.length === 0) return twiml();

  // Does anyone on this exact number have an introduction awaiting their reply?
  let actor: { id: string; name: string } | null = null;
  for (const person of exact) {
    const pending = await prisma.match.findFirst({
      where: {
        stage: { in: ["invited", "mutual_yes"] },
        OR: [
          { personAId: person.id, aDecision: "pending" },
          { personBId: person.id, bDecision: "pending" },
        ],
      },
      select: { id: true },
    });
    if (pending) {
      actor = person;
      break;
    }
  }

  // Open introduction: parse the Y/N answer.
  if (actor) {
    const decision = YES.test(body) ? "yes" : NO.test(body) ? "pass" : null;
    if (!decision) {
      return twiml("Sorry, I didn't catch that. Reply Y if you'd like the introduction, or N to pass.");
    }
    const outcome = await recordIntroDecision(actor.id, decision);
    if (outcome.ok && decision === "pass") {
      return twiml("No problem - I won't make that introduction. I'll keep you in mind for someone else.");
    }
    if (outcome.ok && outcome.connected) {
      return twiml(); // both confirmation texts already sent via REST
    }
    if (outcome.ok) {
      return twiml(`Love it. I'll check with ${outcome.otherName.split(" ")[0]} and connect you both as soon as they say yes.`);
    }
  }

  // No open introduction: if they were recently connected, capture the message
  // as feedback the operator can read in the dashboard.
  const recent = await prisma.match.findFirst({
    where: {
      stage: "connected",
      OR: [{ personAId: { in: candidates.map((c) => c.id) } }, { personBId: { in: candidates.map((c) => c.id) } }],
    },
    orderBy: { connectedAt: "desc" },
    select: { id: true, personAId: true, personBId: true },
  });
  if (recent && body) {
    const subjectId = candidates.find((c) => c.id === recent.personAId || c.id === recent.personBId)?.id || candidates[0].id;
    await prisma.note.create({ data: { subjectId, matchId: recent.id, kind: "feedback", body: body.slice(0, 2000) } });
    return twiml("Thanks for the update - that's really helpful. I'll be in touch.");
  }

  return twiml("Thanks! I don't have an open introduction for you right now, but I'll be in touch when I do.");
}

/** STOP handling: stop chasing this number. Closes any open introduction it is
 *  part of and leaves the operator a durable note, so the dashboard and any
 *  future session both see the opt-out. Best effort: an unmatched number still
 *  gets the opt-out confirmation reply (compliance applies regardless). For
 *  account-wide send suppression, also enable Advanced Opt-Out on the Twilio
 *  Messaging Service. */
async function applyOptOut(from: string): Promise<void> {
  const key = phoneKey(from);
  if (!key) return;
  const fromE164 = normalizePhone(from);
  const people = await prisma.person.findMany({
    where: fromE164
      ? { OR: [{ phone: fromE164 }, { phone: { contains: key.slice(-10) } }] }
      : { phone: { contains: key.slice(-10) } },
    select: { id: true },
  });
  if (people.length === 0) return;
  const ids = people.map((p) => p.id);

  // Close any open intros awaiting these people so we stop chasing a reply.
  await prisma.match.updateMany({
    where: {
      stage: { in: ["invited", "mutual_yes"] },
      OR: [{ personAId: { in: ids } }, { personBId: { in: ids } }],
    },
    data: { stage: "exit", exitReason: "opted_out_sms" },
  });

  // Leave an operator-visible record of the opt-out.
  await prisma.note
    .create({ data: { subjectId: ids[0], kind: "optout", body: "Texted STOP. Do not contact by SMS." } })
    .catch(() => {
      /* note is advisory; never fail the webhook over it */
    });
}
