"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { setSession, clearSession, getSessionPersonId, requireOperator } from "./auth";
import { startThread, recordPick } from "./concierge";
import { mutualFriends } from "./social";

// Demo login. Validates the id exists. Operator access is open by default for
// the demo, but if STUDIO_DEMO_PASSWORD is set in the environment, an operator
// login requires it (one env var locks the matchmaker studio down).
export async function loginAs(personId: string, formData?: FormData) {
  const p = await prisma.person.findUnique({ where: { id: personId } });
  if (!p) throw new Error("Unknown user");
  if (p.isOperator) {
    const gate = process.env.STUDIO_DEMO_PASSWORD;
    const password = formData?.get("password");
    if (gate && password !== gate) throw new Error("Studio access requires the demo passphrase");
  } else if (p.status !== "active") {
    throw new Error("This account is not active");
  }
  await setSession(personId);
  redirect(p.isOperator ? "/studio" : "/app");
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
  // Only a participant of the match may request, and only against a genuine
  // mutual friend (prevents forging a reference from an arbitrary id).
  if (match.personAId !== me && match.personBId !== me) throw new Error("not your match");
  const other = match.personAId === me ? match.personB : match.personA;
  const mutuals = await mutualFriends(me, other.id);
  if (!mutuals.some((f) => f.id === friendId)) throw new Error("not a mutual friend");
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
  const me = await getSessionPersonId();
  if (!me) throw new Error("not logged in");
  const ref = await prisma.reference.findUniqueOrThrow({ where: { id: referenceId } });
  // Only the friend who was asked may reply, and only once.
  if (ref.friendId !== me) throw new Error("not your reference to answer");
  if (ref.status === "replied") throw new Error("already answered");
  await prisma.reference.update({
    where: { id: referenceId },
    data: { reply: reply.slice(0, 600), status: "replied", repliedAt: new Date() },
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
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  await prisma.note.create({ data: { subjectId, authorId: op.id, body: body.slice(0, 2000), kind, matchId } });
  revalidatePath(`/studio/person/${subjectId}`);
}

// Operator: create a suggestion (a Match in "suggested" stage).
export async function createSuggestion(aId: string, bId: string, rationale: string) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const me = op.id;
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
