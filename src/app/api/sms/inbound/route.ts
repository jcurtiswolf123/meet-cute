import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { phoneKey, verifyTwilioSignature } from "@/lib/sms";
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
const NO = /^\s*(n|no|nope|nah|pass|stop|unsubscribe|cancel)\b/i;

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
  const key = phoneKey(from);
  if (!key) return twiml();

  // Match the inbound number to a person by the last 10 digits (forgiving of how
  // the number was stored). If two people share a number, prefer one with a
  // pending introduction.
  const candidates = await prisma.person.findMany({
    where: { phone: { contains: key.slice(-10) } },
    select: { id: true, name: true },
  });
  if (candidates.length === 0) return twiml();

  // Does anyone on this number have an introduction awaiting their reply?
  let actor: { id: string; name: string } | null = null;
  for (const person of candidates) {
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
