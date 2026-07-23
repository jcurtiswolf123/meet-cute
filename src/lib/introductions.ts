// The operator-driven SMS introduction flow.
//
// Mental model: the matchmaker picks two people and sends each a "want an intro?"
// text. Each replies Y/N. When BOTH say yes, we connect them (text each the
// other's currently authorized email when available) and the match moves to
// "connected". One "no" closes it.
//
// A Match in this flow moves: invited -> mutual_yes -> connected, or -> exit.
import { randomBytes } from "crypto";
import * as Sentry from "@sentry/nextjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { matchInviteEmail } from "./email";
import {
  makeDeliveryKey,
  queueConnectionDeliveries,
  queueEmailDelivery,
} from "./delivery";

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

/** Mint or refresh each side's MatchInvite and atomically queue the email.
 *  A provider failure is retried by the delivery worker, and sentAt is only
 *  written after the provider accepts the message. */
export async function sendEmailInvites(
  matchId: string,
  options: { db?: Prisma.TransactionClient; throwOnError?: boolean } = {},
): Promise<number> {
  const queueWith = async (db: Prisma.TransactionClient): Promise<number> => {
    const match = await db.match.findUnique({
      where: { id: matchId },
      include: {
        personA: { select: { id: true, name: true, email: true, headline: true, city: true } },
        personB: { select: { id: true, name: true, email: true, headline: true, city: true } },
      },
    });
    if (!match) return 0;
    const city = match.personA.city || match.personB.city || null;
    const sides = [
      { me: match.personA, other: match.personB, pending: match.aDecision === "pending" },
      { me: match.personB, other: match.personA, pending: match.bDecision === "pending" },
    ];

    let queued = 0;
    for (const [index, { me, other, pending }] of sides.entries()) {
      if (!pending || !me.email) continue;
      const token = newInviteToken();
      const rotatedAt = new Date();
      const existing = await db.matchInvite.findUnique({
        where: { matchId_personId: { matchId, personId: me.id } },
        select: { id: true },
      });
      if (existing) {
        await db.deliveryJob.updateMany({
          where: { inviteId: existing.id, status: { in: ["pending", "failed"] } },
          data: {
            status: "cancelled",
            lastError: "Superseded by a newer invitation.",
            lockedAt: null,
            leaseToken: null,
          },
        });
      }
      const invite = await db.matchInvite.upsert({
        where: { matchId_personId: { matchId, personId: me.id } },
        create: {
          matchId,
          personId: me.id,
          token,
          channel: "email",
          sentAt: null,
          createdAt: rotatedAt,
        },
        update: {
          token,
          channel: "email",
          sentAt: null,
          decidedAt: null,
          createdAt: rotatedAt,
        },
      });
      const message = matchInviteEmail({
        toName: me.name,
        otherName: other.name,
        otherHeadline: other.headline,
        city,
        profileUrl: inviteProfileUrl(token),
      });
      await queueEmailDelivery({
        kind: `intro_invite_${index === 0 ? "a" : "b"}_email`,
        to: me.email,
        subject: message.subject,
        html: message.html,
        text: message.text,
        replyTo: inviteReplyAddress(token) ?? undefined,
        idempotencyKey: makeDeliveryKey("intro-invite", matchId, me.id, token, "email"),
        matchId,
        personId: me.id,
        inviteId: invite.id,
        inviteToken: token,
        db,
      });
      queued += 1;
    }
    return queued;
  };

  try {
    if (options.db) return await queueWith(options.db);
    return await prisma.$transaction((tx) => queueWith(tx));
  } catch (error) {
    console.error(
      `[intro] could not queue email invites for match ${matchId}: ${(error as Error).message}`,
    );
    Sentry.captureException(error);
    if (options.throwOnError) throw error;
    return 0;
  }
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
  const claimed = await prisma.$transaction(async (tx) => {
    const result = await tx.match.updateMany({
      where: {
        id: match.id,
        stage: { in: ["invited", "mutual_yes"] },
        ...pendingSide,
      },
      data: decisionData,
    });
    if (result.count !== 1) return result;
    await tx.deliveryJob.updateMany({
      where: {
        matchId: match.id,
        kind: { startsWith: "intro_invite_" },
        ...(decision === "pass" ? {} : { personId }),
        status: { in: ["pending", "processing", "failed"] },
      },
      data: {
        status: "cancelled",
        lockedAt: null,
        leaseToken: null,
        lastError:
          decision === "pass"
            ? "Cancelled because the introduction was declined."
            : "Cancelled because this recipient already decided.",
      },
    });
    return result;
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
  if (!invite || inviteIsExpired(invite.createdAt)) return { ok: false, reason: "no_match" };

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

/** Both said yes: claim the transition and queue each authorized handoff.
 *  The worker marks the match connected after each person receives one
 *  authorized channel. Re-running repairs an interrupted connecting match
 *  without creating duplicate jobs. */
export async function connectMatch(matchId: string): Promise<boolean> {
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
    if (!state) return false;
    if (state.connectedAt) return true;
    if (state.stage !== "connecting") return false;
  }

  try {
    return (await queueConnectionDeliveries(matchId)) > 0;
  } catch (error) {
    console.error(
      `[intro] could not queue connection delivery for match ${matchId}: ${(error as Error).message}`,
    );
    Sentry.captureException(error);
    return false;
  }
}
