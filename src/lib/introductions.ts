// The operator-driven SMS introduction flow.
//
// Mental model: the matchmaker picks two people and sends each a "want an intro?"
// text. Each replies Y/N. When BOTH say yes, we connect them (text each the
// other's number) and the match moves to "connected". One "no" closes it.
//
// A Match in this flow moves: invited -> mutual_yes -> connected, or -> exit.
import { randomBytes } from "crypto";
import * as Sentry from "@sentry/nextjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { sendSMS, connectedSMS, createGroupConversation } from "./sms";
import { composeGroupIntro } from "./intro-bot";
import { sendEmail, matchInviteEmail, matchThreadEmail } from "./email";

// --- Email double opt-in -----------------------------------------------------

const INVITE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export function inviteIsExpired(createdAt: Date, now: number = Date.now()): boolean {
  return createdAt.getTime() < now - INVITE_MAX_AGE_MS;
}
//
// The email path mirrors the SMS Y/N flow but works with zero carrier setup:
// each matched person gets an email with a link to the other's profile (Yes/Pass
// buttons) and can also reply "Y"/"N". Both converge on recordIntroDecision.

/** Public origin for building invite links. Falls back to the production host. */
function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://hellomeetcute.com").replace(/\/$/, "");
}

/** Token-gated page that shows the OTHER person's profile with Yes/Pass buttons. */
export function inviteProfileUrl(token: string): string {
  return `${appBaseUrl()}/i/${token}`;
}

/** Reply-To address whose local part carries the invite token, so a plain "Y"/"N"
 *  email reply maps back to the exact invite via the inbound webhook. Requires an
 *  inbound domain routed to /api/email/inbound (Resend Inbound). Returns null when
 *  unconfigured, in which case replies fall back to the profile-page buttons. */
export function inviteReplyAddress(token: string): string | null {
  const domain = process.env.RESEND_INBOUND_DOMAIN?.trim();
  if (!domain) return null;
  return `Meet Cute <r+${token}@${domain}>`;
}

/** A high-entropy, URL- and email-local-part-safe capability token. */
function newInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Mint (or refresh) a MatchInvite for each side of a match and email each person
 *  the first opt-in message: a link to the other's profile plus a Y/N ask. Reuses
 *  the per-(match,person) row on a re-invite, rotating the token. Best-effort per
 *  recipient: one send failing never blocks the other or throws. Returns how many
 *  invite emails were dispatched. */
export async function sendEmailInvites(matchId: string): Promise<number> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      personA: { select: { id: true, name: true, email: true, headline: true, city: true } },
      personB: { select: { id: true, name: true, email: true, headline: true, city: true } },
    },
  });
  if (!match) return 0;
  const city = match.personA.city || match.personB.city || null;

  // recipient = the person deciding; other = the profile they see. Skip a side
  // that has already decided so a re-invite only re-emails whoever is still
  // pending (safe to call on both a fresh match and an operator resend).
  const sides = [
    { me: match.personA, other: match.personB, pending: match.aDecision === "pending" },
    { me: match.personB, other: match.personA, pending: match.bDecision === "pending" },
  ];

  let sent = 0;
  for (const { me, other, pending } of sides) {
    if (!pending) continue; // already said yes/pass; don't re-ask
    if (!me.email) continue; // no baseline channel for this person
    const token = newInviteToken();
    try {
      await prisma.matchInvite.upsert({
        where: { matchId_personId: { matchId, personId: me.id } },
        create: { matchId, personId: me.id, token, channel: "email", sentAt: new Date() },
        update: { token, channel: "email", sentAt: new Date(), decidedAt: null },
      });
    } catch (e) {
      console.error(`[intro] could not mint invite for ${me.id} on match ${matchId}: ${(e as Error).message}`);
      Sentry.captureException(e);
      continue;
    }
    const m = matchInviteEmail({
      toName: me.name,
      otherName: other.name,
      otherHeadline: other.headline,
      city,
      profileUrl: inviteProfileUrl(token),
    });
    const replyTo = inviteReplyAddress(token) ?? undefined;
    const res = await sendEmail({ to: me.email, subject: m.subject, html: m.html, text: m.text, replyTo });
    if (res.ok) sent += 1;
  }
  return sent;
}

/** Email BOTH matched people the moment they connect, as a SINGLE message with
 *  both on the To line, so they land on one shared thread and can reply-all
 *  directly. Best-effort: a mail failure never breaks the connect. */
async function emailConnection(
  a: { name: string; email: string | null; city: string | null },
  b: { name: string; email: string | null; city: string | null },
): Promise<void> {
  const to = [a.email, b.email].filter((e): e is string => !!e);
  if (to.length < 2) return; // need both inboxes to open a shared thread
  const m = matchThreadEmail({ aName: a.name, bName: b.name, city: a.city || b.city || null });
  await sendEmail({ to, subject: m.subject, html: m.html, text: m.text });
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

/** The shared state transition for one Y/N reply, given the already-resolved
 *  match, which side replied, and the channel it arrived on. Logs the reply,
 *  moves the match (pass -> exit, first yes -> mutual_yes-pending, second yes ->
 *  connect), and returns what happened. Callers differ only in how they FIND the
 *  match+side (SMS: newest-pending by phone; email: exact by invite token). */
async function applyIntroDecision(
  match: {
    id: string;
    aDecision: string;
    bDecision: string;
    personA: { id: string; name: string };
    personB: { id: string; name: string };
  },
  side: "a" | "b",
  decision: IntroDecision,
  channel: "sms" | "email",
): Promise<DecisionOutcome> {
  const personId = side === "a" ? match.personA.id : match.personB.id;
  const me = side === "a" ? match.personA : match.personB;
  const otherPerson = side === "a" ? match.personB : match.personA;

  const pendingSide =
    side === "a"
      ? ({ aDecision: "pending" } satisfies Prisma.MatchWhereInput)
      : ({ bDecision: "pending" } satisfies Prisma.MatchWhereInput);
  const decisionData: Prisma.MatchUpdateManyMutationInput =
    decision === "pass"
      ? {
          ...(side === "a" ? { aDecision: "pass" } : { bDecision: "pass" }),
          stage: "exit",
          exitReason: channel === "email" ? "declined_email" : "declined_sms",
          lastActorId: personId,
        }
      : {
          ...(side === "a" ? { aDecision: "yes" } : { bDecision: "yes" }),
          lastActorId: personId,
        };

  // Claim this side's pending decision in one database statement. Exactly one
  // concurrent request can win, and no yes path can proceed after a pass closes
  // the introduction.
  const claimed = await prisma.match.updateMany({
    where: {
      id: match.id,
      stage: { in: ["invited", "mutual_yes"] },
      ...pendingSide,
    },
    data: decisionData,
  });
  if (claimed.count !== 1) return { ok: false, reason: "no_match" };

  await logIntroMessage({
    matchId: match.id,
    body: decision === "yes" ? "Replied Y (yes to the intro)" : "Replied N (passed)",
    direction: "in",
    author: me.name.split(" ")[0],
    personId,
    kind: "decision",
  });

  if (decision === "pass") {
    return { ok: true, side, matchId: match.id, nowMutual: false, connected: false, otherName: otherPerson.name };
  }

  const updated = await prisma.match.findUnique({
    where: { id: match.id },
    select: { aDecision: true, bDecision: true, stage: true },
  });
  if (!updated || updated.stage === "exit") return { ok: false, reason: "no_match" };

  const nowMutual = updated.aDecision === "yes" && updated.bDecision === "yes";
  if (!nowMutual) {
    // First yes: park at mutual_yes-pending so we still know it's awaiting the other.
    await prisma.match.updateMany({
      where: {
        id: match.id,
        stage: "invited",
        aDecision: { not: "pass" },
        bDecision: { not: "pass" },
      },
      data: { stage: "mutual_yes" },
    });
    return { ok: true, side, matchId: match.id, nowMutual: false, connected: false, otherName: otherPerson.name };
  }

  const connected = await connectMatch(match.id);
  return { ok: true, side, matchId: match.id, nowMutual: true, connected, otherName: otherPerson.name };
}

/** Record one person's Y/N reply to their pending introduction (SMS path or
 *  operator UI) and, if both have now said yes, connect them. Finds the newest
 *  introduction still awaiting THIS person's decision. */
export async function recordIntroDecision(personId: string, decision: IntroDecision): Promise<DecisionOutcome> {
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
      personA: { select: { id: true, name: true } },
      personB: { select: { id: true, name: true } },
    },
  });
  if (!match) return { ok: false, reason: "no_match" };
  const side: "a" | "b" = match.personAId === personId ? "a" : "b";
  return applyIntroDecision(match, side, decision, "sms");
}

/** Record a Y/N decision that arrived via an email invite token (a reply parsed
 *  by the inbound webhook, or a Yes/Pass button on the token-gated profile page).
 *  Unlike the SMS path this maps to an EXACT match+person, so it is correct even
 *  when the person has several open invites. Idempotent per side: once that side
 *  has already decided (or the match closed/connected) it returns no_match rather
 *  than re-transitioning. */
export async function recordInviteDecision(token: string, decision: IntroDecision): Promise<DecisionOutcome> {
  const invite = await prisma.matchInvite.findUnique({ where: { token } });
  if (!invite) return { ok: false, reason: "no_match" };

  const match = await prisma.match.findUnique({
    where: { id: invite.matchId },
    include: {
      personA: { select: { id: true, name: true } },
      personB: { select: { id: true, name: true } },
    },
  });
  if (!match) return { ok: false, reason: "no_match" };
  if (!["invited", "mutual_yes"].includes(match.stage)) return { ok: false, reason: "no_match" };

  const side: "a" | "b" = match.personAId === invite.personId ? "a" : "b";
  // Only act while this side is still pending (idempotent against a double click
  // or a reply that arrives after the button was used).
  const myDecision = side === "a" ? match.aDecision : match.bDecision;
  if (myDecision !== "pending") return { ok: false, reason: "no_match" };

  const outcome = await applyIntroDecision(match, side, decision, "email");
  await prisma.matchInvite
    .update({ where: { id: invite.id }, data: { decidedAt: new Date() } })
    .catch(() => {});
  return outcome;
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
  // Claim the mutual transition before any external side effect. This prevents
  // concurrent yes replies from creating duplicate group threads or messages.
  const claimed = await prisma.match.updateMany({
    where: {
      id: matchId,
      stage: { in: ["invited", "mutual_yes"] },
      connectedAt: null,
      aDecision: "yes",
      bDecision: "yes",
    },
    data: { stage: "connecting" },
  });
  if (claimed.count !== 1) {
    const state = await prisma.match.findUnique({
      where: { id: matchId },
      select: { stage: true, connectedAt: true },
    });
    return !!state && (state.stage === "connecting" || !!state.connectedAt);
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      personA: { select: { name: true, phone: true, email: true, city: true, smsConsentAt: true } },
      personB: { select: { name: true, phone: true, email: true, city: true, smsConsentAt: true } },
    },
  });
  if (!match) return false;

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
  if (operatorPhone && a.phone && b.phone && a.smsConsentAt && b.smsConsentAt) {
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
    if (a.phone && a.smsConsentAt) {
      await sendSMS({ to: a.phone, body: connectedSMS({ toName: a.name, otherName: b.name, otherPhone: b.phone || "(no number on file)" }) });
    }
    if (b.phone && b.smsConsentAt) {
      await sendSMS({ to: b.phone, body: connectedSMS({ toName: b.name, otherName: a.name, otherPhone: a.phone || "(no number on file)" }) });
    }
  }

  const connected = await prisma.match.updateMany({
    where: { id: matchId, stage: "connecting", aDecision: "yes", bDecision: "yes" },
    data: { stage: "connected", connectedAt: new Date(), conversationSid },
  });
  if (connected.count !== 1) return false;

  // Open the shared email thread: one message to both, so they land in the same
  // conversation and reply-all directly (baseline channel, independent of SMS).
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
