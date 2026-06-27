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

  const decision = YES.test(body) ? "yes" : NO.test(body) ? "pass" : null;
  if (!decision) {
    return twiml("Sorry, I didn't catch that. Reply Y if you'd like the introduction, or N to pass.");
  }

  // Try each candidate until one has a pending introduction to act on.
  for (const person of candidates) {
    const outcome = await recordIntroDecision(person.id, decision);
    if (outcome.ok) {
      if (decision === "pass") {
        return twiml("No problem - I won't make that introduction. I'll keep you in mind for someone else.");
      }
      if (outcome.connected) {
        // Both confirmation texts already went out via REST; stay quiet here.
        return twiml();
      }
      return twiml(`Love it. I'll check with ${outcome.otherName.split(" ")[0]} and connect you both as soon as they say yes.`);
    }
  }

  // No pending introduction for this number.
  return twiml("Thanks! I don't have an open introduction for you right now, but I'll be in touch when I do.");
}
