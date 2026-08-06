// Recommending someone who has not applied.
//
// The gate runs one way: an applicant names two friends and Mutuals asks them.
// The thing people actually say first is the other way round - "you should meet
// my friend Ana" - and until now there was nowhere to say it. Jess asked for
// this on 2026-08-06, off people replying to the invite copy with a name.
//
// What happens:
//
//   somebody fills in /refer   their name, their friend's name and email, and
//                              optionally a couple of sentences about them
//   the friend gets one email  it says who put them forward, quotes the words,
//                              and links to the application
//   they apply                 the note becomes a real recommendation on their
//                              row, already answered, so they are asked for one
//                              friend instead of two
//
// The nominator needs no account, for the same reason a recommender needs none:
// requiring one loses most of them at the first click, and the referral we want
// is the one somebody makes in the ten seconds they thought of the person.

import { randomBytes } from "node:crypto";
import type { Nomination, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { newRecommendationToken } from "./recommendations";

/**
 * How much somebody has to write for a nomination to count as a recommendation.
 *
 * The same floor the recommendation form uses. Below it this is an invitation
 * and nothing more: "she's great" is not something to put on a profile, and
 * crediting it would let a two-word nomination halve the gate.
 */
export const NOMINATION_NOTE_MIN = 40;

export function newNominationToken(): string {
  return randomBytes(32).toString("base64url");
}

/** The URL a nominee opens: the application, told who sent them. */
export function nominationApplyUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://hellomutuals.com").replace(/\/$/, "");
  return `${base}/apply?ref=${token}`;
}

export function nominationCounts(note: string | null | undefined): boolean {
  return String(note ?? "").trim().length >= NOMINATION_NOTE_MIN;
}

export type NominationInput = {
  nominatorName: string;
  nominatorEmail: string;
  nominatorPersonId?: string | null;
  name: string;
  email: string;
  note?: string | null;
};

export type SaveNominationResult = {
  nomination: Nomination;
  /** False when this pair already existed, so nothing new should be emailed. */
  isNew: boolean;
  /** They are already a member: recorded, and deliberately not emailed. */
  alreadyMember: boolean;
  /** They have an application open, so the invite is a nudge, not an intro. */
  existingApplicant: boolean;
};

/**
 * Record a nomination.
 *
 * Idempotent on the pair, because the honest reading of the same person putting
 * the same friend forward twice is a double-tapped button, not a second
 * referral. A repeat submission updates the note (they may have gone back to
 * write more) and never re-sends the invite: `isNew` is what the caller mails
 * on.
 */
export async function saveNomination(input: NominationInput): Promise<SaveNominationResult> {
  const email = input.email.trim().toLowerCase();
  const nominatorEmail = input.nominatorEmail.trim().toLowerCase();
  const note = input.note?.trim() ? input.note.trim().slice(0, 1200) : null;

  const existing = await prisma.nomination.findUnique({
    where: { email_nominatorEmail: { email, nominatorEmail } },
  });

  const nominee = await prisma.person.findUnique({
    where: { email },
    select: { id: true, status: true, appliedAt: true },
  });
  const alreadyMember = nominee?.status === "active";
  const existingApplicant = !!nominee && !alreadyMember;

  if (existing) {
    const nomination = await prisma.nomination.update({
      where: { id: existing.id },
      data: {
        nominatorName: input.nominatorName.trim().slice(0, 120),
        name: input.name.trim().slice(0, 120),
        // Never blank a note that is already there: the second submission is
        // usually the one with less typed in it, not more.
        ...(note ? { note } : {}),
        ...(input.nominatorPersonId ? { nominatorPersonId: input.nominatorPersonId } : {}),
      },
    });
    return { nomination, isNew: false, alreadyMember, existingApplicant };
  }

  const nomination = await prisma.nomination.create({
    data: {
      token: newNominationToken(),
      nominatorName: input.nominatorName.trim().slice(0, 120),
      nominatorEmail,
      nominatorPersonId: input.nominatorPersonId || null,
      name: input.name.trim().slice(0, 120),
      email,
      note,
      // Somebody already inside needs no invitation to join, and sending one
      // would tell a stranger they are a member. Recorded either way, because
      // who vouches for whom is the graph this product runs on.
      status: alreadyMember ? "skipped" : "sent",
    },
  });
  return { nomination, isNew: true, alreadyMember, existingApplicant };
}

export function markInvited(id: string): Promise<Nomination> {
  return prisma.nomination.update({ where: { id }, data: { invitedAt: new Date() } });
}

/** The nomination behind a token, for the greeting on /apply. */
export function nominationByToken(token: string) {
  return prisma.nomination.findUnique({
    where: { token },
    select: { name: true, email: true, note: true, nominatorName: true },
  });
}

/**
 * Turn the nominations written about somebody into recommendations on their row.
 *
 * Called when they apply. A note with real words becomes an answered
 * recommendation in the nominator's name, which is exactly what it is: somebody
 * who knows them wrote about them, before being asked. It counts toward their
 * two, so a nominated applicant is asked for one friend rather than two.
 *
 * A nomination with no words (or too few) still links, so the funnel can be
 * measured, and credits nothing.
 *
 * Idempotent twice over: the Recommendation row is keyed on
 * [applicantId, email], and a nomination already stamped `applied` is skipped.
 * Both matter, because this runs on every render of the friends page as well as
 * on submit.
 */
export async function convertNominationsFor(person: {
  id: string;
  email: string | null;
}): Promise<number> {
  const email = String(person.email ?? "").trim().toLowerCase();
  if (!email) return 0;

  const pending = await prisma.nomination.findMany({
    where: { email, status: { in: ["sent", "skipped"] } },
    orderBy: { createdAt: "asc" },
  });
  if (pending.length === 0) return 0;

  let credited = 0;
  for (const nomination of pending) {
    // Nobody can vouch for themselves by nominating themselves.
    if (nomination.nominatorEmail === email) {
      await prisma.nomination.update({
        where: { id: nomination.id },
        data: { status: "applied", appliedAt: new Date(), personId: person.id },
      });
      continue;
    }

    if (nominationCounts(nomination.note)) {
      const existing = await prisma.recommendation.findUnique({
        where: { applicantId_email: { applicantId: person.id, email: nomination.nominatorEmail } },
      });
      // A friend who has already written for them owns that row: a nomination
      // must never overwrite words somebody wrote when asked.
      if (!existing) {
        await prisma.recommendation.create({
          data: {
            applicantId: person.id,
            name: nomination.nominatorName,
            email: nomination.nominatorEmail,
            token: newRecommendationToken(),
            status: "submitted",
            requestedAt: nomination.createdAt,
            submittedAt: nomination.createdAt,
            body: nomination.note,
            relationship: "Put them forward",
          },
        });
        credited += 1;
      }
    }

    await prisma.nomination.update({
      where: { id: nomination.id },
      data: { status: "applied", appliedAt: new Date(), personId: person.id },
    });
  }
  return credited;
}

/** Nominations written about this address that have not been used yet. Read
 *  before the application is submitted, to greet somebody with what they have
 *  already been given. */
export function pendingNominationsFor(email: string | null | undefined) {
  const address = String(email ?? "").trim().toLowerCase();
  if (!address) return Promise.resolve([] as Nomination[]);
  return prisma.nomination.findMany({
    where: { email: address, status: { in: ["sent", "skipped"] } },
    orderBy: { createdAt: "asc" },
  });
}

/** Everything one person has put forward, newest first. For the studio. */
export function nominationsBy(
  where: Prisma.NominationWhereInput,
): Promise<Nomination[]> {
  return prisma.nomination.findMany({ where, orderBy: { createdAt: "desc" } });
}
