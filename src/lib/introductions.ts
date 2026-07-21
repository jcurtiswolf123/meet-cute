// The operator-driven SMS introduction flow.
//
// Mental model: the matchmaker picks two people and sends each a "want an intro?"
// text. Each replies Y/N. When BOTH say yes, we connect them (text each the
// other's number) and the match moves to "connected". One "no" closes it.
//
// A Match in this flow moves: invited -> mutual_yes -> connected, or -> exit.
import * as Sentry from "@sentry/nextjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { sendSMS, connectedSMS, createGroupConversation } from "./sms";
import { composeGroupIntro } from "./intro-bot";
import { sendEmail, connectionEmail } from "./email";

/** Email BOTH matched people the moment they connect, handing each the other's
 *  contact. Email is the baseline channel, so this fires whether or not either
 *  side opted in to SMS. Best-effort: a mail failure never breaks the connect. */
async function emailConnection(
  a: { name: string; email: string | null; phone: string | null; city: string | null },
  b: { name: string; email: string | null; phone: string | null; city: string | null },
): Promise<void> {
  const city = a.city || b.city || null;
  const jobs: Promise<unknown>[] = [];
  if (a.email) {
    const m = connectionEmail({ toName: a.name, otherName: b.name, otherEmail: b.email, otherPhone: b.phone, city });
    jobs.push(sendEmail({ to: a.email, subject: m.subject, html: m.html, text: m.text }));
  }
  if (b.email) {
    const m = connectionEmail({ toName: b.name, otherName: a.name, otherEmail: a.email, otherPhone: a.phone, city });
    jobs.push(sendEmail({ to: b.email, subject: m.subject, html: m.html, text: m.text }));
  }
  await Promise.allSettled(jobs);
}

/** Append a line to a match's introduction transcript (operator-console view).
 *  Never throws: a logging failure must not break the intro flow. */
export async function logIntroMessage(args: {
  matchId: string;
  body: string;
  direction?: "in" | "out";
  author?: string;
  personId?: string | null;
  kind?: string;
}): Promise<void> {
  try {
    await prisma.introMessage.create({
      data: {
        matchId: args.matchId,
        body: args.body.slice(0, 2000),
        direction: args.direction ?? "out",
        author: args.author ?? "bot",
        personId: args.personId ?? null,
        kind: args.kind ?? "text",
      },
    });
  } catch {
    /* transcript logging is best-effort */
  }
}

// Bulk-action thresholds, shared by the operator console (to count candidates)
// and the bulk server actions (to act on them) so the two never disagree.
const DAY = 24 * 3600 * 1000;
export const STALLED_DAYS = 3; // no reply for this long -> offer a resend
export const EXPIRED_DAYS = 14; // no reply for this long -> offer to close

/** Prisma where-clause for intros that have stalled: still invited or waiting on
 *  one reply, last invited at least STALLED_DAYS ago. */
export function stalledWhere(now: Date = new Date()): Prisma.MatchWhereInput {
  return {
    stage: { in: ["invited", "mutual_yes"] },
    OR: [{ aDecision: "pending" }, { bDecision: "pending" }],
    notifiedAAt: { lte: new Date(now.getTime() - STALLED_DAYS * DAY) },
  };
}

/** Prisma where-clause for intros that have expired: never reached mutual yes and
 *  have been silent for at least EXPIRED_DAYS. */
export function expiredWhere(now: Date = new Date()): Prisma.MatchWhereInput {
  return {
    stage: { in: ["invited", "mutual_yes"] },
    NOT: { AND: [{ aDecision: "yes" }, { bDecision: "yes" }] },
    notifiedAAt: { lte: new Date(now.getTime() - EXPIRED_DAYS * DAY) },
  };
}

export type IntroDecision = "yes" | "pass";

type DecisionOutcome =
  | { ok: false; reason: "no_match" }
  | { ok: true; side: "a" | "b"; matchId: string; nowMutual: boolean; connected: boolean; otherName: string };

/** Record one person's Y/N reply to their pending introduction and, if both have
 *  now said yes, connect them. Returns what happened so the caller (SMS webhook
 *  or operator UI) can respond appropriately. */
export async function recordIntroDecision(personId: string, decision: IntroDecision): Promise<DecisionOutcome> {
  // The introduction this reply belongs to: the newest one still awaiting this
  // person's decision (invited or already-mutual-pending). A person is "A" or
  // "B" on the match; their pending decision tells us which reply we're filling.
  const match = await prisma.match.findFirst({
    where: {
      stage: { in: ["invited", "mutual_yes"] },
      OR: [
        { personAId: personId, aDecision: "pending" },
        { personBId: personId, bDecision: "pending" },
      ],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      personA: { select: { id: true, name: true, phone: true } },
      personB: { select: { id: true, name: true, phone: true } },
    },
  });

  if (!match) return { ok: false, reason: "no_match" };

  const side: "a" | "b" = match.personAId === personId ? "a" : "b";
  const otherPerson = side === "a" ? match.personB : match.personA;
  const me = side === "a" ? match.personA : match.personB;
  await logIntroMessage({
    matchId: match.id,
    body: decision === "yes" ? "Replied Y (yes to the intro)" : "Replied N (passed)",
    direction: "in",
    author: me.name.split(" ")[0],
    personId,
    kind: "decision",
  });

  if (decision === "pass") {
    await prisma.match.update({
      where: { id: match.id },
      data: {
        [side === "a" ? "aDecision" : "bDecision"]: "pass",
        stage: "exit",
        exitReason: "declined_sms",
        lastActorId: personId,
      },
    });
    return { ok: true, side, matchId: match.id, nowMutual: false, connected: false, otherName: otherPerson.name };
  }

  const updated = await prisma.match.update({
    where: { id: match.id },
    data: {
      [side === "a" ? "aDecision" : "bDecision"]: "yes",
      lastActorId: personId,
    },
  });

  const nowMutual = updated.aDecision === "yes" && updated.bDecision === "yes";
  if (!nowMutual) {
    // First yes: park at mutual_yes-pending so we still know it's awaiting the other.
    await prisma.match.update({ where: { id: match.id }, data: { stage: "mutual_yes" } });
    return { ok: true, side, matchId: match.id, nowMutual: false, connected: false, otherName: otherPerson.name };
  }

  const connected = await connectMatch(match.id);
  return { ok: true, side, matchId: match.id, nowMutual: true, connected, otherName: otherPerson.name };
}

/** Both said yes: connect them and mark connected. Idempotent: re-running
 *  won't double-send once connectedAt is set.
 *
 *  Preferred path: open a real 3-way group MMS thread (operator + both
 *  applicants) masked behind our single Twilio number, so they can talk in one
 *  place with the matchmaker present. If the operator has no cell on file, or
 *  the group-MMS call fails for any reason (e.g. Group MMS not enabled on the
 *  account, a non-+1 number, a carrier rejection), we fall back to brokering
 *  each side the other's number. Either way the match is marked connected and
 *  this function never throws. */
export async function connectMatch(matchId: string): Promise<boolean> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      personA: { select: { name: true, phone: true, email: true, city: true } },
      personB: { select: { name: true, phone: true, email: true, city: true } },
    },
  });
  if (!match) return false;
  if (match.connectedAt) return true; // already connected

  const a = match.personA;
  const b = match.personB;

  // The operator who created the intro joins the group from their own cell.
  let operatorPhone: string | null = null;
  let operatorName = "your matchmaker";
  if (match.createdById) {
    const op = await prisma.person.findUnique({
      where: { id: match.createdById },
      select: { name: true, phone: true },
    });
    operatorPhone = op?.phone ?? null;
    if (op?.name) operatorName = op.name;
  }

  // The bot's group opener: introduces both, shares a line about each, and
  // suggests a concrete first step. Composed once and reused for the group
  // message (and logged to the transcript) so what the operator sees matches
  // what went out.
  const opener = await composeGroupIntro({
    operatorName,
    aName: a.name,
    bName: b.name,
    aboutA: match.aboutPersonA,
    aboutB: match.aboutPersonB,
    city: a.city || b.city,
  });

  let grouped = false;
  let conversationSid: string | null = null;
  if (operatorPhone && a.phone && b.phone) {
    try {
      const res = await createGroupConversation({
        participants: [operatorPhone, a.phone, b.phone],
        operatorAddress: process.env.TWILIO_FROM ?? null,
        body: opener,
        friendlyName: `mc-intro-${matchId}`,
      });
      grouped = res.ok;
      if (res.ok) {
        conversationSid = res.conversationSid;
      } else {
        console.error(`[intro] group MMS failed for match ${matchId} (${res.reason}); falling back to broker`);
        Sentry.captureMessage(`group MMS failed for match ${matchId}: ${res.reason}`, "warning");
      }
    } catch (e) {
      console.error(`[intro] group MMS threw for match ${matchId}: ${(e as Error).message}; falling back to broker`);
      Sentry.captureException(e);
    }
  }

  // Fallback (operator has no cell, or the group thread couldn't be created):
  // text each person the other's number, the original broker behavior.
  if (!grouped) {
    if (a.phone) {
      await sendSMS({ to: a.phone, body: connectedSMS({ toName: a.name, otherName: b.name, otherPhone: b.phone || "(no number on file)" }) });
    }
    if (b.phone) {
      await sendSMS({ to: b.phone, body: connectedSMS({ toName: b.name, otherName: a.name, otherPhone: a.phone || "(no number on file)" }) });
    }
  }

  await prisma.match.update({
    where: { id: matchId },
    data: { stage: "connected", connectedAt: new Date(), conversationSid },
  });

  // Email both people their introduction (baseline channel, independent of SMS).
  // Best-effort and idempotent: connectedAt above guards re-runs from re-sending.
  try {
    await emailConnection(a, b);
  } catch (e) {
    console.error(`[intro] connection email failed for match ${matchId}: ${(e as Error).message}`);
    Sentry.captureException(e);
  }

  // Record the bot's opener on the transcript so the operator console shows it
  // (group_open when a real group thread opened, otherwise the brokered handoff).
  await logIntroMessage({
    matchId,
    body: grouped ? opener : `Connected ${a.name.split(" ")[0]} and ${b.name.split(" ")[0]} by sharing numbers (no group thread).`,
    direction: "out",
    author: "bot",
    kind: grouped ? "group_open" : "system",
  });
  return true;
}
