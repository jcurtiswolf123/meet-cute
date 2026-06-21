"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "./prisma";
import {
  setSession,
  clearSession,
  getSessionPersonId,
  getCurrentPerson,
  requireOperator,
  createLoginToken,
  normalizeEmail,
  purgeExpiredAuth,
} from "./auth";
import { sendEmail, magicLinkEmail } from "./email";
import { rateLimit } from "./ratelimit";
import { startThread, recordPick } from "./concierge";
import { mutualFriends } from "./social";
import { deleteUpload } from "./uploads";

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
  const xff = h.get("x-forwarded-for");
  const ip = (
    h.get("fly-client-ip") ||
    (xff ? xff.split(",").map((s) => s.trim()).filter(Boolean).at(-1) : "") ||
    h.get("x-real-ip") ||
    "anon"
  ).trim();
  const validEmail = email.includes("@") && email.length <= 254;
  const ipOk = (await rateLimit(`magic:ip:${ip}`, 10, 60 * 60 * 1000)).ok;
  const emailOk = validEmail && (await rateLimit(`magic:email:${email}`, 3, 15 * 60 * 1000)).ok;

  if (base && validEmail && ipOk && emailOk) {
    const token = await createLoginToken(email);
    const link = `${base}/auth/verify?token=${encodeURIComponent(token)}`;
    const { subject, html, text } = magicLinkEmail(link);
    await sendEmail({ to: email, subject, html, text });
    void purgeExpiredAuth();
  } else if (!base) {
    console.error("[auth] NEXT_PUBLIC_APP_URL must be set in production to send magic links");
  }
  redirect("/login?sent=1");
}

// Demo login. DISABLED in production. Local/dev only: pick any seeded user to
// see their view. Operator access can still be gated with STUDIO_DEMO_PASSWORD.
export async function loginAs(personId: string, formData?: FormData) {
  // Disabled unless explicitly enabled AND not production, so a misconfigured
  // staging that shares the prod DB can never impersonate accounts.
  if (process.env.NODE_ENV === "production" || process.env.MEETCUTE_DEMO_LOGIN !== "1") {
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

  // Re-check blocks at decision time: if either party blocked the other after
  // the suggestion was created, the match cannot proceed.
  const other = isA ? match.personBId : match.personAId;
  const blocked = await prisma.block.findFirst({
    where: { OR: [{ blockerId: me, blockedId: other }, { blockerId: other, blockedId: me }] },
  });
  if (blocked) {
    await prisma.match.update({ where: { id: matchId }, data: { stage: "exit", exitReason: "blocked" } });
    revalidatePath("/app");
    return;
  }

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

// --- safety: report + block --------------------------------------------------

const REPORT_REASONS = ["harassment", "fake", "inappropriate", "safety", "other"];

export async function reportPerson(formData: FormData) {
  const me = await getSessionPersonId();
  if (!me) throw new Error("not logged in");
  const subjectId = String(formData.get("subjectId") || "");
  const reason = String(formData.get("reason") || "other");
  const detail = String(formData.get("detail") || "").slice(0, 1000);
  if (!subjectId || subjectId === me) throw new Error("invalid report");
  const subject = await prisma.person.findUnique({ where: { id: subjectId } });
  if (!subject) throw new Error("no such member");
  await prisma.report.create({
    data: { reporterId: me, subjectId, reason: REPORT_REASONS.includes(reason) ? reason : "other", detail },
  });
  revalidatePath("/app");
  revalidatePath("/studio");
}

export async function blockPerson(formData: FormData) {
  const me = await getSessionPersonId();
  if (!me) throw new Error("not logged in");
  const blockedId = String(formData.get("subjectId") || "");
  if (!blockedId || blockedId === me) throw new Error("invalid block");
  await prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId: me, blockedId } },
    create: { blockerId: me, blockedId },
    update: {},
  });
  // Pull any live match between them out of circulation.
  await prisma.match.updateMany({
    where: {
      OR: [
        { personAId: me, personBId: blockedId },
        { personAId: blockedId, personBId: me },
      ],
    },
    data: { stage: "exit", exitReason: "blocked" },
  });
  revalidatePath("/app");
  revalidatePath("/app/matches");
}

export async function unblockPerson(formData: FormData) {
  const me = await getSessionPersonId();
  if (!me) throw new Error("not logged in");
  const blockedId = String(formData.get("subjectId") || "");
  await prisma.block.deleteMany({ where: { blockerId: me, blockedId } });
  revalidatePath("/app/settings");
}

/** Ids the given person can never be shown (blocks in either direction). */
export async function blockedIdsFor(personId: string): Promise<string[]> {
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: personId }, { blockedId: personId }] },
    select: { blockerId: true, blockedId: true },
  });
  const ids = new Set<string>();
  for (const r of rows) ids.add(r.blockerId === personId ? r.blockedId : r.blockerId);
  return [...ids];
}

// --- account rights: complete application (18+ + consent), delete account -----

export async function completeApplication(formData: FormData) {
  const me = await getCurrentPerson();
  if (!me) redirect("/login");

  const first = String(formData.get("first") || "").trim();
  const last = String(formData.get("last") || "").trim();
  const city = String(formData.get("city") || "").includes("Francisco") ? "SF" : "NYC";
  const lookingFor = String(formData.get("lookingFor") || "").slice(0, 2000);
  const birthdateRaw = String(formData.get("birthdate") || "");
  const agreed = formData.get("agree") === "on";

  if (!agreed) throw new Error("You must accept the Terms and Privacy Policy to continue.");
  const birthdate = birthdateRaw ? new Date(birthdateRaw) : null;
  if (!birthdate || Number.isNaN(birthdate.getTime())) throw new Error("Enter your date of birth.");
  const age = Math.floor((Date.now() - birthdate.getTime()) / (365.25 * 24 * 3600 * 1000));
  if (age < 18) throw new Error("You must be 18 or older to join Meet Cute.");

  const name = `${first} ${last}`.trim() || me!.name;
  await prisma.person.update({
    where: { id: me!.id },
    data: { name, city, lookingFor, birthdate, age, agreedTosAt: new Date() },
  });
  redirect("/apply/thanks");
}

/** Permanently delete the signed-in member and all of their data. */
export async function deleteAccount() {
  const me = await getSessionPersonId();
  if (!me) throw new Error("not logged in");

  const myMatches = await prisma.match.findMany({
    where: { OR: [{ personAId: me }, { personBId: me }] },
    select: { id: true },
  });
  const matchIds = myMatches.map((m) => m.id);

  // Capture photo storage locations before the cascade removes the rows, so we
  // can free the backing Blob objects (the DB cascade only drops the records).
  const myPhotos = await prisma.photo.findMany({
    where: { personId: me },
    select: { storageUrl: true },
  });

  await prisma.$transaction([
    // Notes that reference me, my matches, or were authored by me (operators).
    prisma.note.deleteMany({
      where: { OR: [{ subjectId: me }, { authorId: me }, { matchId: { in: matchIds } }] },
    }),
    // References tied to me (requester/friend are plain ids, no cascade).
    prisma.reference.deleteMany({ where: { OR: [{ requesterId: me }, { friendId: me }] } }),
    // My matches (cascades concierge threads, messages, remaining references).
    prisma.match.deleteMany({ where: { OR: [{ personAId: me }, { personBId: me }] } }),
    // Vouches in either direction.
    prisma.vouch.deleteMany({ where: { OR: [{ voucherId: me }, { subjectId: me }] } }),
    // Referrals I sent; detach invites/referrals that point at me.
    prisma.referral.deleteMany({ where: { inviterId: me } }),
    prisma.referral.updateMany({ where: { inviteeId: me }, data: { inviteeId: null } }),
    prisma.person.updateMany({ where: { referredById: me }, data: { referredById: null } }),
    // Coaching engagements I am part of.
    prisma.coachingEngagement.deleteMany({ where: { OR: [{ clientId: me }, { coachId: me }] } }),
    // Finally the person; cascades photos, prompts, sessions, blocks, reports,
    // dinner attendance.
    prisma.person.delete({ where: { id: me } }),
  ]);

  // Free the photo objects from the store after the rows are gone.
  await Promise.all(myPhotos.map((p) => deleteUpload(p.storageUrl)));

  await clearSession();
  redirect("/?deleted=1");
}

// Operator: moderate a pending photo.
export async function approvePhoto(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const id = String(formData.get("photoId") || "");
  await prisma.photo.update({ where: { id }, data: { status: "approved" } });
  revalidatePath("/studio/moderation");
}

export async function rejectPhoto(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const id = String(formData.get("photoId") || "");
  await prisma.photo.update({ where: { id }, data: { status: "rejected" } });
  revalidatePath("/studio/moderation");
}

// Operator: resolve a safety report.
export async function resolveReport(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const id = String(formData.get("reportId") || "");
  const status = String(formData.get("status") || "reviewed");
  await prisma.report.update({
    where: { id },
    data: { status: ["reviewed", "actioned", "dismissed"].includes(status) ? status : "reviewed" },
  });
  revalidatePath("/studio/moderation");
}

// Member: remove one of their own photos.
export async function deletePhoto(formData: FormData) {
  const me = await getSessionPersonId();
  if (!me) throw new Error("not logged in");
  const id = String(formData.get("photoId") || "");
  const photo = await prisma.photo.findUnique({ where: { id } });
  if (!photo || photo.personId !== me) throw new Error("not your photo");
  await prisma.photo.delete({ where: { id } });
  // Free the backing object (Blob is billed); best-effort, never blocks delete.
  await deleteUpload(photo.storageUrl);
  revalidatePath("/app/profile");
}

// Operator: vet an applicant. Approve promotes to active (joins the roster);
// decline marks them exited.
export async function setMemberStatus(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const id = String(formData.get("personId") || "");
  const action = String(formData.get("action") || "");
  if (action === "approve") {
    await prisma.person.update({ where: { id }, data: { status: "active", acceptedAt: new Date() } });
  } else if (action === "decline") {
    await prisma.person.update({ where: { id }, data: { status: "exited" } });
  }
  revalidatePath("/studio");
}

// --- operator (admin) accounts ----------------------------------------------
//
// There is one login mechanism for everyone (magic link by email); an account
// is an operator iff Person.isOperator is true, which routes them to /studio and
// unlocks every operators-only action. These let an existing operator add or
// revoke other operators self-serve, instead of editing the DB.

// Operator: add another operator by email. Creates the account if new, promotes
// it if it exists, and emails them a sign-in link so they can log in right away.
export async function addOperator(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");

  const email = normalizeEmail(String(formData.get("email") || ""));
  if (!email.includes("@") || email.length > 254) throw new Error("Enter a valid email.");
  const rawName = String(formData.get("name") || "").trim().slice(0, 60);
  const city = String(formData.get("city") || "").includes("Francisco") ? "SF" : "NYC";

  const existing = await prisma.person.findUnique({ where: { email } });
  if (existing) {
    await prisma.person.update({
      where: { id: existing.id },
      data: { isOperator: true, status: "active" },
    });
  } else {
    const local = email.split("@")[0].replace(/[._-]+/g, " ").trim();
    const name = rawName || (local ? local.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60) : "Operator");
    await prisma.person.create({
      data: { email, name, city, isOperator: true, status: "active", headline: "Matchmaker" },
    });
  }

  // Best-effort invite: email them a one-time sign-in link if we can build the
  // public URL. Never block on mail; the account works regardless.
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (base) {
    try {
      const token = await createLoginToken(email);
      const link = `${base}/auth/verify?token=${encodeURIComponent(token)}`;
      const { subject, html, text } = magicLinkEmail(link);
      await sendEmail({ to: email, subject, html, text });
    } catch {
      /* invite email is best-effort */
    }
  }

  revalidatePath("/studio/team");
}

// Operator: revoke operator (admin) access. Keeps the person/account; just drops
// the flag. Guards against removing yourself or the last operator (lockout).
export async function removeOperator(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const id = String(formData.get("personId") || "");
  if (!id) throw new Error("missing operator");
  if (id === op.id) throw new Error("You cannot revoke your own operator access.");

  const count = await prisma.person.count({ where: { isOperator: true } });
  if (count <= 1) throw new Error("Cannot remove the last operator.");

  await prisma.person.update({ where: { id }, data: { isOperator: false } });
  revalidatePath("/studio/team");
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
  // Never suggest a pair where either has blocked the other.
  const blocked = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: aId, blockedId: bId },
        { blockerId: bId, blockedId: aId },
      ],
    },
  });
  if (blocked) throw new Error("these members cannot be matched");
  await prisma.match.create({
    data: { personAId: aId, personBId: bId, rationale, createdById: me ?? undefined, stage: "suggested" },
  });
  revalidatePath("/studio/pipeline");
}
