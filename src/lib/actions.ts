"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { setSession, clearSession, getSessionPersonId } from "./auth";
import { startThread, recordPick } from "./concierge";

export async function loginAs(personId: string) {
  await setSession(personId);
  const p = await prisma.person.findUnique({ where: { id: personId } });
  redirect(p?.isOperator ? "/studio" : "/app");
}

export async function logout() {
  await clearSession();
  redirect("/login");
}

// A member opts in or passes on their current suggestion.
export async function decideMatch(matchId: string, decision: "yes" | "pass") {
  const me = await getSessionPersonId();
  if (!me) throw new Error("not logged in");
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) throw new Error("no match");
  const isA = match.personAId === me;
  if (!isA && match.personBId !== me) throw new Error("not your match");

  const data = isA ? { aDecision: decision } : { bDecision: decision };
  const updated = await prisma.match.update({
    where: { id: matchId },
    data: { ...data, lastActorId: me },
  });

  if (decision === "pass") {
    await prisma.match.update({ where: { id: matchId }, data: { stage: "exit", exitReason: "passed" } });
  } else if (updated.aDecision === "yes" && updated.bDecision === "yes") {
    await prisma.match.update({ where: { id: matchId }, data: { stage: "mutual_yes" } });
    await startThread(matchId);
  }
  revalidatePath("/app");
  revalidatePath("/app/matches");
  revalidatePath("/studio/pipeline");
}

export async function pickSlot(threadId: string, slotIso: string) {
  const me = await getSessionPersonId();
  if (!me) throw new Error("not logged in");
  await recordPick(threadId, me, slotIso);
  revalidatePath("/app/matches");
}

export async function addVouch(subjectId: string, note: string) {
  const me = await getSessionPersonId();
  if (!me) throw new Error("not logged in");
  await prisma.vouch.upsert({
    where: { voucherId_subjectId: { voucherId: me, subjectId } },
    create: { voucherId: me, subjectId, note },
    update: { note },
  });
  revalidatePath("/app");
}

// Post-match: ask a mutual friend for the inside scoop.
export async function requestReference(matchId: string, friendId: string) {
  const me = await getSessionPersonId();
  if (!me) throw new Error("not logged in");
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: matchId },
    include: { personA: true, personB: true },
  });
  const otherName = (match.personAId === me ? match.personB : match.personA).name.split(" ")[0];
  const meName = (match.personAId === me ? match.personA : match.personB).name.split(" ")[0];
  await prisma.reference.create({
    data: {
      matchId,
      requesterId: me,
      friendId,
      prompt: `${meName} & ${otherName} just matched on Meet Cute and you know them both. Any words?`,
      status: "requested",
    },
  });
  revalidatePath("/app/matches");
}

export async function replyReference(referenceId: string, reply: string) {
  await prisma.reference.update({
    where: { id: referenceId },
    data: { reply, status: "replied", repliedAt: new Date() },
  });
  revalidatePath("/app/matches");
}

export async function updateProfile(form: {
  headline: string;
  bio: string;
  lookingFor: string;
  dealBreakers: string;
}) {
  const me = await getSessionPersonId();
  if (!me) throw new Error("not logged in");
  await prisma.person.update({ where: { id: me }, data: form });
  revalidatePath("/app/profile");
}

// Operator: log a note on a person or match.
export async function addNote(subjectId: string, body: string, kind = "general", matchId?: string) {
  const me = await getSessionPersonId();
  await prisma.note.create({ data: { subjectId, authorId: me ?? undefined, body, kind, matchId } });
  revalidatePath(`/studio/person/${subjectId}`);
}

// Operator: create a suggestion (a Match in "suggested" stage).
export async function createSuggestion(aId: string, bId: string, rationale: string) {
  const me = await getSessionPersonId();
  const existing = await prisma.match.findFirst({
    where: {
      OR: [
        { personAId: aId, personBId: bId },
        { personAId: bId, personBId: aId },
      ],
    },
  });
  if (existing) throw new Error("already suggested");
  await prisma.match.create({
    data: { personAId: aId, personBId: bId, rationale, createdById: me ?? undefined, stage: "suggested" },
  });
  revalidatePath("/studio/pipeline");
}
