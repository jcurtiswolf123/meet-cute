// The operator-driven introduction flow, with email as the baseline channel.
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
import { introInviteSMS, introInviteTemplate } from "./sms";
import { STORED_EXT } from "./uploads";
import { pairKey, type PairState } from "./pairs";
import {
  makeDeliveryKey,
  queueConnectionDeliveries,
  queueEmailDelivery,
  queueSmsDelivery,
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
  return (process.env.NEXT_PUBLIC_APP_URL || "https://hellomutuals.com").replace(/\/$/, "");
}

/** Token-gated page that shows the OTHER person's profile with Yes/Pass buttons. */
export function inviteProfileUrl(token: string): string {
  return `${appBaseUrl()}/i/${token}`;
}

/** Absolute URL for a photo embedded in an invite email. Authorized by the same
 *  token as the invite itself, so it loads with no session (email clients and
 *  their image proxies never carry cookies). */
export function invitePhotoUrl(token: string, photoId: string): string {
  return `${appBaseUrl()}/api/invite/${token}/photo/${photoId}.${STORED_EXT}`;
}

/** Reply-To address whose local part carries the invite token, so a plain "Y"/"N"
 *  email reply maps back to the exact invite via the inbound webhook. Requires an
 *  inbound domain routed to /api/email/inbound (Resend Inbound). Returns null when
 *  unconfigured, in which case replies fall back to the profile-page buttons. */
export function inviteReplyAddress(token: string): string | null {
  // RESEND_INBOUND_DOMAIN may list several accepted domains. New invites always
  // go out on the first one; the webhook keeps accepting the rest so invites
  // already sitting in a member's inbox still resolve after a domain change.
  const domain = process.env.RESEND_INBOUND_DOMAIN?.split(",")[0]?.trim();
  if (!domain) return null;
  return `Mutuals <r+${token}@${domain}>`;
}

/** A high-entropy, URL- and email-local-part-safe capability token. */
function newInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

// Everything the invite email needs about the person being introduced. All of it
// is the member's own profile: nobody writes a description of anybody else.
const invitePersonSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  smsConsentAt: true,
  headline: true,
  bio: true,
  lookingFor: true,
  dealBreakers: true,
  recommendation: true,
  voucherName: true,
  age: true,
  neighborhood: true,
  city: true,
  photos: {
    where: { status: "approved" },
    orderBy: { order: "asc" },
    // Three, not one. The invite email is where most people decide, and one
    // 88px circle is not a look at someone. Three is the ceiling because Gmail
    // clips a message past ~102KB and every extra image is another remote
    // fetch the recipient's client may refuse.
    take: 3,
    select: { id: true },
  },
  prompts: {
    orderBy: { order: "asc" },
    select: { question: true, answer: true },
  },
} as const;

/** Mint or refresh each side's MatchInvite and atomically queue the invitation.
 *  Email carries the whole profile; anyone who separately consented to SMS also
 *  gets a short nudge pointing at the same token-gated page. A provider failure
 *  is retried by the delivery worker, and sentAt is only written after the
 *  provider accepts the message. */
export async function sendEmailInvites(
  matchId: string,
  options: { db?: Prisma.TransactionClient; throwOnError?: boolean } = {},
): Promise<number> {
  const queueWith = async (db: Prisma.TransactionClient): Promise<number> => {
    const match = await db.match.findUnique({
      where: { id: matchId },
      include: {
        personA: { select: invitePersonSelect },
        personB: { select: invitePersonSelect },
      },
    });
    if (!match) return 0;
    const sides = [
      { me: match.personA, other: match.personB, pending: match.aDecision === "pending" },
      { me: match.personB, other: match.personA, pending: match.bDecision === "pending" },
    ];

    let queued = 0;
    for (const [index, { me, other, pending }] of sides.entries()) {
      // Someone with neither an email nor text consent has no authorized channel;
      // createIntroduction rejects that case up front.
      if (!pending || (!me.email && !(me.phone && me.smsConsentAt))) continue;
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
      // Email whenever we have an address, because only email can carry the
      // profile. SMS alone is the fallback for a phone-only member.
      const channel = me.email ? "email" : "sms";
      const invite = await db.matchInvite.upsert({
        where: { matchId_personId: { matchId, personId: me.id } },
        create: {
          matchId,
          personId: me.id,
          token,
          channel,
          sentAt: null,
          createdAt: rotatedAt,
        },
        update: {
          token,
          channel,
          sentAt: null,
          decidedAt: null,
          createdAt: rotatedAt,
        },
      });
      const side = index === 0 ? "a" : "b";
      const profileUrl = inviteProfileUrl(token);

      if (me.email) {
        const message = matchInviteEmail({
          toName: me.name,
          other: {
            name: other.name,
            age: other.age,
            neighborhood: other.neighborhood,
            headline: other.headline,
            bio: other.bio,
            lookingFor: other.lookingFor,
            dealBreakers: other.dealBreakers,
            recommendation: other.recommendation,
            voucherName: other.voucherName,
            prompts: other.prompts,
            photoUrl: other.photos[0] ? invitePhotoUrl(token, other.photos[0].id) : null,
            photoUrls: other.photos.map((photo) => invitePhotoUrl(token, photo.id)),
          },
          matchmakerNote: match.rationale,
          profileUrl,
        });
        await queueEmailDelivery({
          kind: `intro_invite_${side}_email`,
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

      // SMS cannot carry a profile, so it is a nudge to the same token-gated
      // page. Only for people who separately consented to texts.
      if (me.phone && me.smsConsentAt) {
        await queueSmsDelivery({
          kind: `intro_invite_${side}_sms`,
          to: me.phone,
          body: introInviteSMS({
            toName: me.name,
            otherName: other.name,
            profileUrl,
          }),
          template: introInviteTemplate({
            toName: me.name,
            otherName: other.name,
            profileUrl,
          }),
          idempotencyKey: makeDeliveryKey("intro-invite", matchId, me.id, token, "sms"),
          matchId,
          personId: me.id,
          inviteId: invite.id,
          db,
        });
        queued += 1;
      }
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

/** Stages where an invitation is already out and awaiting an answer. These are
 *  the only ones that block a new introduction for the same pair: re-sending
 *  rotates the invite token and would strand the email that person is holding.
 *
 *  Deliberately excludes "suggested", which is the stage BEFORE an introduction
 *  (the pipeline reads suggested -> invited -> mutual_yes -> connected) and has
 *  contacted nobody, so it gets promoted into a real introduction instead. Also
 *  excludes "exit" and "connected", which are finished and can be re-opened. */
export const LIVE_INTRO_STAGES = ["invited", "mutual_yes", "connecting"];

/**
 * Every pair an operator should be told about before pressing send.
 *
 * `createIntroduction` already refuses an open invitation and a block, but it
 * refuses AFTER the click, by redirecting back with a code. The composer knows
 * both people the moment they are picked, so with this it can say so while
 * there is still something to change.
 */
export async function pairStates(): Promise<Record<string, PairState>> {
  const [matches, blocks] = await Promise.all([
    prisma.match.findMany({ select: { personAId: true, personBId: true, stage: true } }),
    prisma.block.findMany({ select: { blockerId: true, blockedId: true } }),
  ]);

  const states: Record<string, PairState> = {};
  for (const m of matches) {
    if (LIVE_INTRO_STAGES.includes(m.stage)) {
      states[pairKey(m.personAId, m.personBId)] = "open";
    } else if (m.stage !== "exit" && m.stage !== "suggested") {
      // Connected and every dating stage after it: these two have already met
      // through us. Re-introducing is allowed, it is just worth knowing.
      states[pairKey(m.personAId, m.personBId)] = "connected";
    }
  }
  // A block outranks anything else, so it is written last.
  for (const b of blocks) states[pairKey(b.blockerId, b.blockedId)] = "blocked";
  return states;
}

/** Where createIntroduction sends the operator back to with its outcome. The
 *  composer submits the page it lives on, and only an in-app studio path is
 *  honoured: anything absolute, protocol-relative, or absent falls back, so a
 *  tampered hidden field cannot turn a server action into an open redirect. */
export function introReturnPath(raw: unknown): string {
  const value = typeof raw === "string" ? raw : "";
  // A single leading slash rules out "//host" and "https://host". No dot
  // segments, so "/studio/../../app" cannot climb out of the studio. The rest is
  // an ordinary path: id segments only, no query or fragment of its own.
  if (!/^\/studio(\/[A-Za-z0-9._~%-]+)*$/.test(value)) return "/studio";
  if (value.split("/").some((seg) => seg === "." || seg === "..")) return "/studio";
  return value;
}

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
