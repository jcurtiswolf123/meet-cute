"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "./prisma";
import {
  setSession,
  clearSession,
  getSessionPersonId,
  requireOperator,
  createLoginToken,
  normalizeEmail,
} from "./auth";
import { sendEmail, magicLinkEmail } from "./email";
import { rateLimit } from "./ratelimit";
import { startThread, recordPick } from "./concierge";
import { mutualFriends } from "./social";

// Request a magic-link sign-in. Always returns the same "check your email"
// result regardless of whether the address exists, is rate-limited, or is
// invalid, so the form cannot enumerate members or signal rate-limit state.
export async function requestMagicLink(formData: FormData) {
  const email = normalizeEmail(String(formData.get("email") || ""));
  const h = await headers();

  // Resolve the link base. Never trust the Host header for an outbound,
  // security-sensitive URL: a forged Host would point the emailed magic link at
  // an attacker domain and leak the token (account takeover). Require
  // NEXT_PUBLIC_APP_URL in production; only fall back to the request host in
  // local dev.
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const base =
    configured ||
    (process.env.NODE_ENV !== "production" ? `http://${h.get("host") || "localhost:3009"}` : null);

  // Per-IP and per-email caps stop inbox-bombing a victim and burning the mail
  // provider's quota. (In-memory; single instance. Swap to Upstash for multi.)
  const ip = (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "anon").trim();
  const validEmail = email.includes("@") && email.length <= 254;
  const ipOk = rateLimit(`magic:ip:${ip}`, 10, 60 * 60 * 1000).ok;
  const emailOk = validEmail && rateLimit(`magic:email:${email}`, 3, 15 * 60 * 1000).ok;

  if (base && validEmail && ipOk && emailOk) {
    const token = await createLoginToken(email);
    const link = `${base}/auth/verify?token=${encodeURIComponent(token)}`;
    const { subject, html, text } = magicLinkEmail(link);
    await sendEmail({ to: email, subject, html, text });
  } else if (!base) {
    console.error("[auth] NEXT_PUBLIC_APP_URL must be set in production to send magic links");
  }
  redirect("/login?sent=1");
}

// Demo login. DISABLED in production. Local/dev only: pick any seeded user to
// see their view. Operator access can still be gated with STUDIO_DEMO_PASSWORD.
export async function loginAs(personId: string, formData?: FormData) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo login is disabled. Use the email sign-in link.");
  }
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
