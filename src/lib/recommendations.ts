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
export function remainingRequired(
  applicantGender: string | null,
  recommendations: Pick<Recommendation, "status" | "gender">[],
): number {
  const qualifying = recommendations.filter(
    (r) => r.status === "submitted" && countsTowardGate(applicantGender, r.gender),
  ).length;
  return Math.max(0, REQUIRED_RECOMMENDATIONS - qualifying);
}

export function newRecommendationToken(): string {
  return randomBytes(32).toString("base64url");
}

/** The absolute URL a recommender opens to write their recommendation. */
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
        },
        update: {
          name: person.name.trim(),
          gender: person.gender,
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
  const submitted = recommendations.filter((r) => r.status === "submitted");
  const qualifying = submitted.filter((r) => countsTowardGate(applicant?.gender ?? null, r.gender));
  const remaining = Math.max(0, REQUIRED_RECOMMENDATIONS - qualifying.length);
  return {
    applicantGender: applicant?.gender ?? null,
    recommendations,
    submitted,
    qualifying,
    outstanding: recommendations.filter((r) => r.status === "requested"),
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

/** How long to wait before nudging a friend who has not written back. */
export const REMINDER_DELAY_MS = 48 * 60 * 60 * 1000;
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
    where: { email: address, status: "submitted" },
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
    where: { email: address, status: "submitted", convertedPersonId: null },
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

  const lead = state.qualifying[0];
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
      ...(applicant.recommendation?.trim() ? {} : { recommendation: lead?.body ?? null }),
      ...(applicant.voucherName?.trim() ? {} : { voucherName: lead?.name ?? null }),
    },
  });
  return { accepted: changed.count === 1, justAccepted: changed.count === 1, remaining: 0 };
}
