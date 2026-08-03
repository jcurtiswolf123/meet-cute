// The recommendation gate.
//
// An application is not accepted because a form was submitted. It is accepted
// when two friends of the opposite gender to the applicant write back about
// them. The applicant names the friends; Mutuals emails them; their words land
// on the applicant's profile and the second reply lets the applicant in.
//
// Two reasons it works this way. The obvious one: a stranger's own description
// of themselves is worth less than two people who know them. The other one is
// distribution, and it is the point of the design - the only way in is to ask
// two people to vouch for you, so every accepted member has already told two
// people what Mutuals is.
//
// Everything here is deliberately independent of sessions. The friend gets a
// token in an email and needs no account, because requiring one would lose most
// of them at the first click.

import { randomBytes } from "node:crypto";
import type { Prisma, Recommendation } from "@prisma/client";
import { prisma } from "./prisma";

/** How many written recommendations an applicant needs before they are in. */
export const REQUIRED_RECOMMENDATIONS = 2;

export const GENDERS = ["woman", "man", "nonbinary"] as const;
export type Gender = (typeof GENDERS)[number];

export function isGender(value: string): value is Gender {
  return (GENDERS as readonly string[]).includes(value);
}

/**
 * Whether a recommender counts toward the applicant's two.
 *
 * "Two friends of the opposite gender" is the rule Joshua asked for, and for a
 * woman or a man it means exactly what it says. For a nonbinary applicant there
 * is no opposite to require, and inventing one would either lock them out or
 * force them to misdescribe a friend, so the count still applies and the gender
 * constraint does not. This is the only place that judgement lives.
 */
export function countsTowardGate(applicantGender: string | null, recommenderGender: string): boolean {
  if (applicantGender === "woman") return recommenderGender === "man";
  if (applicantGender === "man") return recommenderGender === "woman";
  return true;
}

/** The recommenders still needed, given who has already written back. */
/** An answer, either kind. A tap is an answer; only a body is a quote. */
export function hasAnswered(status: string): boolean {
  return status === "endorsed" || status === "submitted";
}

export function remainingRequired(
  applicantGender: string | null,
  recommendations: Pick<Recommendation, "status" | "gender">[],
): number {
  const qualifying = recommendations.filter(
    (r) => hasAnswered(r.status) && countsTowardGate(applicantGender, r.gender),
  ).length;
  return Math.max(0, REQUIRED_RECOMMENDATIONS - qualifying);
}

export function newRecommendationToken(): string {
  return randomBytes(32).toString("base64url");
}

/** The absolute URL a recommender opens to write their recommendation. */
/**
 * The address a friend can simply reply to, which is the least work this ask
 * can possibly be: no link, no page, no account, just hit reply and type.
 *
 * Same `r+<token>@` shape the match invites already use, so the inbound webhook
 * and the reply parser that handles 51 real-world client shapes are reused
 * rather than rebuilt. Null when inbound is not configured, in which case the
 * page is still the way in.
 */
export function recommendationReplyTo(token: string): string | undefined {
  const domain = process.env.RESEND_INBOUND_DOMAIN?.split(",")[0]?.trim();
  if (!domain) return undefined;
  return `Mutuals <r+${token}@${domain}>`;
}

export function recommendationUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://hellomutuals.com").replace(/\/$/, "");
  return `${base}/r/${token}`;
}

export type RecommenderInput = {
  name: string;
  email: string;
  gender: string;
};

/**
 * Record the friends an applicant named, and return the rows that still need a
 * request email.
 *
 * Re-submitting an application is not a reason to email the same friend twice,
 * so a name/gender correction updates the existing row and only a genuinely new
 * email address produces a new request. A friend who has already written back
 * is never touched: their words are theirs, and rewriting the row would drop
 * the recommendation the applicant is already relying on.
 */
export async function saveRecommenders(
  applicantId: string,
  recommenders: RecommenderInput[],
  applicantNote?: string | null,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<Recommendation[]> {
  const client = db as typeof prisma;
  const saved: Recommendation[] = [];
  for (const person of recommenders) {
    const email = person.email.trim().toLowerCase();
    const existing = await client.recommendation.findUnique({
      where: { applicantId_email: { applicantId, email } },
    });
    if (existing?.status === "submitted") {
      saved.push(existing);
      continue;
    }
    saved.push(
      await client.recommendation.upsert({
        where: { applicantId_email: { applicantId, email } },
        create: {
          applicantId,
          email,
          name: person.name.trim(),
          gender: person.gender,
          token: newRecommendationToken(),
          applicantNote: applicantNote?.trim() || null,
        },
        update: {
          name: person.name.trim(),
          gender: person.gender,
          ...(applicantNote?.trim() ? { applicantNote: applicantNote.trim() } : {}),
        },
      }),
    );
  }
  return saved;
}

export type GateState = {
  applicantGender: string | null;
  recommendations: Recommendation[];
  submitted: Recommendation[];
  /** Submitted AND counting toward the gate (the opposite-gender rule). */
  qualifying: Recommendation[];
  outstanding: Recommendation[];
  written: Recommendation[];
  remaining: number;
  satisfied: boolean;
};

export async function gateState(applicantId: string): Promise<GateState> {
  const applicant = await prisma.person.findUnique({
    where: { id: applicantId },
    select: {
      gender: true,
      recommendationsReceived: { orderBy: { createdAt: "asc" } },
    },
  });
  const recommendations = applicant?.recommendationsReceived ?? [];
  const submitted = recommendations.filter((r) => hasAnswered(r.status));
  const qualifying = submitted.filter((r) => countsTowardGate(applicant?.gender ?? null, r.gender));
  const remaining = Math.max(0, REQUIRED_RECOMMENDATIONS - qualifying.length);
  return {
    applicantGender: applicant?.gender ?? null,
    recommendations,
    submitted,
    qualifying,
    outstanding: recommendations.filter((r) => r.status === "requested"),
    /** Answered with actual words, which is the only thing that can be quoted. */
    written: recommendations.filter((r) => r.status === "submitted" && r.body),
    remaining,
    satisfied: remaining === 0,
  };
}

// --- the growth loop ---------------------------------------------------------
//
// A recommender is the warmest lead this product will ever see. They know a
// member personally, they are in the right city and age band, and they just
// spent two minutes writing carefully about someone's dating life. Before this,
// all of that ended on a thank-you page.
//
// What is deliberately NOT done: making them sign up before they can vouch.
// Gate the vouch behind an account and most of them never write it, and then
// the applicant they were asked about cannot get in either. The loop has to
// take the vouch first and make the offer second.

/**
 * When to nudge a friend who has not answered: two days, five days, ten days.
 *
 * All three are queued when the request is, and all three are withdrawn the
 * moment they answer. One nudge catches the people who meant to reply and
 * forgot; it does not catch anyone who needed to be asked twice, and reply rate
 * is one of only two numbers this loop multiplies.
 */
export const REMINDER_SCHEDULE_MS = [
  48 * 60 * 60 * 1000,
  5 * 24 * 60 * 60 * 1000,
  10 * 24 * 60 * 60 * 1000,
];
/** How long after vouching to ask the friend whether they want this too. */
export const FOLLOW_UP_DELAY_MS = 36 * 60 * 60 * 1000;

export type FastTrack = {
  /** The recommendation this person wrote, which is what earns the credit. */
  recommendationId: string;
  /** The member they vouched for, who now counts as one of their two. */
  member: { id: string; name: string; email: string | null; gender: string | null };
};

/**
 * Someone applying who has already vouched for a member needs one new friend,
 * not two: the member they vouched for counts as the other.
 *
 * This is the incentive that makes the loop turn, and it is not a discount
 * invented to be generous. Someone a member's own circle already vouched for is
 * exactly who this network wants, and the vouch they wrote is real evidence
 * that already exists. Halving the work is what raises the one number the loop
 * depends on: how many recommenders become members.
 *
 * The opposite-gender rule still applies to the credit. A man who vouched for a
 * man has not satisfied half of "two women", so he gets no credit and is asked
 * for two, the same as anyone else.
 */
export async function fastTrackFor(
  email: string | null | undefined,
  applicantGender: string | null,
): Promise<FastTrack | null> {
  const address = String(email ?? "").trim().toLowerCase();
  if (!address) return null;
  const written = await prisma.recommendation.findFirst({
    where: { email: address, status: { in: ["endorsed", "submitted"] } },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      applicant: { select: { id: true, name: true, email: true, gender: true, status: true } },
    },
  });
  if (!written) return null;
  // Only a member counts. Vouching for someone who was declined, or who never
  // got in, is not a credential.
  if (written.applicant.status !== "active") return null;
  if (!countsTowardGate(applicantGender, written.applicant.gender ?? "")) return null;
  return { recommendationId: written.id, member: written.applicant };
}

/** How many friends this applicant has to name on the form. */
export function requiredNewRecommenders(fastTrack: FastTrack | null): number {
  return fastTrack ? REQUIRED_RECOMMENDATIONS - 1 : REQUIRED_RECOMMENDATIONS;
}

/**
 * Record that a recommender became an applicant.
 *
 * Two things happen, and they are different: the Recommendation rows they wrote
 * are stamped with the person they became (which is the only way the funnel can
 * ever be measured), and a Vouch row is written for each member they vouched
 * for (which is the durable member-to-member relation the studio already reads
 * for social proof).
 */
export async function linkRecommenderSignup(person: {
  id: string;
  email: string | null;
}): Promise<number> {
  const address = String(person.email ?? "").trim().toLowerCase();
  if (!address) return 0;
  const written = await prisma.recommendation.findMany({
    where: { email: address, status: { in: ["endorsed", "submitted"] }, convertedPersonId: null },
    select: { id: true, applicantId: true, body: true },
  });
  if (written.length === 0) return 0;

  await prisma.recommendation.updateMany({
    where: { id: { in: written.map((r) => r.id) } },
    data: { convertedPersonId: person.id, convertedAt: new Date() },
  });
  for (const row of written) {
    if (row.applicantId === person.id) continue;
    await prisma.vouch.upsert({
      where: { voucherId_subjectId: { voucherId: person.id, subjectId: row.applicantId } },
      create: { voucherId: person.id, subjectId: row.applicantId, note: row.body },
      update: {},
    });
  }
  return written.length;
}

/**
 * One friend answered. This is the only place that records it, because there
 * are now three doors into the same act: the button in the page, the one-tap
 * vouch, and a plain reply to the request email. Three call sites writing the
 * same transition by hand is how one of them quietly stops cancelling the
 * nudges, or stops accepting the applicant.
 *
 * A tap sets `endorsed`. Words set `submitted` and can upgrade an earlier tap.
 * Words never overwrite words: the first thing someone wrote is theirs.
 */
export async function recordAnswer(
  token: string,
  answer: { body?: string | null; relationship?: string | null; endorseOnly?: boolean },
): Promise<
  | { ok: false; reason: "unknown" | "closed" }
  | { ok: true; request: Recommendation; applicant: { id: string; name: string; email: string | null }; alreadyAnswered: boolean }
> {
  const request = await prisma.recommendation.findUnique({
    where: { token },
    include: { applicant: { select: { id: true, name: true, email: true, status: true } } },
  });
  if (!request) return { ok: false, reason: "unknown" };
  if (request.applicant.status === "exited") return { ok: false, reason: "closed" };

  const body = answer.body?.trim() ? answer.body.trim().slice(0, 1200) : null;
  const alreadyAnswered = hasAnswered(request.status);

  // Guarded on the statuses this transition is legal from, so two tabs, or a
  // tap racing a reply, cannot both count as the answer.
  const from = body ? ["requested", "endorsed"] : ["requested"];
  const claimed = await prisma.recommendation.updateMany({
    where: { id: request.id, status: { in: from } },
    data: body
      ? {
          status: "submitted",
          submittedAt: new Date(),
          body,
          ...(answer.relationship?.trim()
            ? { relationship: answer.relationship.trim().slice(0, 160) }
            : {}),
        }
      : { status: "endorsed", endorsedAt: new Date() },
  });
  if (claimed.count !== 1 && !alreadyAnswered) return { ok: false, reason: "closed" };

  const fresh = await prisma.recommendation.findUniqueOrThrow({ where: { id: request.id } });
  return { ok: true, request: fresh, applicant: request.applicant, alreadyAnswered };
}

export type AcceptanceResult = {
  accepted: boolean;
  /** True only on the transition, so the welcome email is sent exactly once. */
  justAccepted: boolean;
  remaining: number;
};

/**
 * Accept the applicant if their recommendations are in.
 *
 * Guarded by `status: "applicant"` inside a single updateMany, so two friends
 * submitting at the same moment cannot both see themselves as the second one
 * and send two welcome emails: exactly one update matches a row.
 *
 * An operator can still accept someone by hand, and a declined applicant
 * ("exited") is never revived by a late recommendation.
 */
export async function acceptIfRecommended(applicantId: string): Promise<AcceptanceResult> {
  const state = await gateState(applicantId);
  if (!state.satisfied) return { accepted: false, justAccepted: false, remaining: state.remaining };

  // Only a row with words can supply the quote a profile and an introduction
  // email render. A tap accepts someone; it does not put words in their mouth.
  const lead = state.qualifying.find((r) => r.body?.trim()) ?? null;
  const applicant = await prisma.person.findUnique({
    where: { id: applicantId },
    select: { status: true, recommendation: true, voucherName: true },
  });
  if (!applicant) return { accepted: false, justAccepted: false, remaining: state.remaining };
  if (applicant.status !== "applicant") {
    return { accepted: applicant.status === "active", justAccepted: false, remaining: 0 };
  }

  const changed = await prisma.person.updateMany({
    where: { id: applicantId, status: "applicant", isOperator: false },
    data: {
      status: "active",
      acceptedAt: new Date(),
      // Copy the lead recommendation onto the single-line fields every existing
      // surface already reads. Never overwrite something an operator or the
      // member has since edited by hand.
      ...(applicant.recommendation?.trim() || !lead ? {} : { recommendation: lead.body }),
      ...(applicant.voucherName?.trim() || !lead ? {} : { voucherName: lead.name }),
    },
  });
  return { accepted: changed.count === 1, justAccepted: changed.count === 1, remaining: 0 };
}
