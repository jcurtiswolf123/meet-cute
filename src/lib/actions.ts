"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { timingSafeEqual } from "crypto";
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
import {
  sendSMS,
  normalizePhone,
  normalizeInstagram,
  normalizeLinkedin,
  introInviteSMS,
  feedbackRequestSMS,
  sendConversationMessage,
} from "./sms";
import { connectMatch, logIntroMessage, stalledWhere, expiredWhere, sendEmailInvites, recordInviteDecision } from "./introductions";
import { rateLimit } from "./ratelimit";
import { startThread, recordPick } from "./concierge";
import { mutualFriends } from "./social";
import { deleteUpload } from "./uploads";
import { createEventRecord, inviteToEvent } from "./events";
import { allowMemberDemoLogin, allowOperatorDemoLogin } from "./demo-login";

// A normalized phone is only usable for the SMS intro flow if it carries a full
// subscriber number. normalizePhone is deliberately lenient (it will return
// "+123" for "123"), so callers that gate on a real, textable number must check
// the digit count here. E.164 allows up to 15 digits; a real mobile has at least
// 10 (US bare number).
function isTextablePhone(normalized: string | null | undefined): boolean {
  if (!normalized) return false;
  const digits = normalized.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

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

  const rawAfter = String(formData.get("after") || "/login");
  const after = rawAfter.startsWith("/") && !rawAfter.startsWith("//") ? rawAfter : "/login";
  const dest = after.includes("sent=") ? after : `${after}${after.includes("?") ? "&" : "?"}sent=1`;
  redirect(dest);
}

// Operator-only magic link (studio sign-in). Sends a link only when the email
// belongs to an active operator so members/applicants are not silently routed
// to /app or /apply after clicking.
export async function requestOperatorMagicLink(formData: FormData) {
  const email = normalizeEmail(String(formData.get("email") || ""));
  const h = await headers();

  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const base =
    configured ||
    (process.env.NODE_ENV !== "production" ? `http://${h.get("host") || "localhost:3009"}` : null);

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
    const person = await prisma.person.findUnique({ where: { email }, select: { isOperator: true } });
    if (person?.isOperator) {
      const token = await createLoginToken(email);
      const link = `${base}/auth/verify?token=${encodeURIComponent(token)}`;
      const { subject, html, text } = magicLinkEmail(link);
      await sendEmail({ to: email, subject, html, text });
      void purgeExpiredAuth();
    }
  } else if (!base) {
    console.error("[auth] NEXT_PUBLIC_APP_URL must be set in production to send magic links");
  }

  redirect("/studio/login?sent=1");
}

// Demo login. Local dev: any seeded user. Production: operators only, passphrase-gated.
export async function loginAs(personId: string, formData?: FormData) {
  const p = await prisma.person.findUnique({ where: { id: personId } });
  if (!p) throw new Error("Unknown user");

  if (p.isOperator) {
    if (!allowOperatorDemoLogin()) {
      throw new Error("Demo login is disabled. Use the email sign-in link.");
    }
    const gate = process.env.STUDIO_DEMO_PASSWORD;
    if (gate) {
      // Rate-limit attempts per IP so the shared passphrase is not brute-forceable,
      // and compare in constant time so it cannot be guessed via a timing oracle.
      const h = await headers();
      const ip = (h.get("fly-client-ip") || h.get("x-real-ip") || "anon").trim();
      if (!(await rateLimit(`demologin:ip:${ip}`, 10, 60 * 60 * 1000)).ok) {
        throw new Error("Too many attempts. Try again later.");
      }
      const provided = Buffer.from(String(formData?.get("password") ?? ""));
      const expected = Buffer.from(gate);
      const okPass = provided.length === expected.length && timingSafeEqual(provided, expected);
      if (!okPass) throw new Error("Studio access requires the demo passphrase");
    }
  } else {
    if (!allowMemberDemoLogin()) {
      throw new Error("Demo login is disabled. Use the email sign-in link.");
    }
    if (p.status !== "active") throw new Error("This account is not active");
  }

  await setSession(personId);
  redirect(p.isOperator ? "/studio" : "/app");
}

export async function logout(formData?: FormData) {
  const returnTo = formData?.get("returnTo") === "/studio/login" ? "/studio/login" : "/login";
  await clearSession();
  redirect(returnTo);
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
  recommendation?: string;
  voucherName?: string;
  voucherContact?: string;
}) {
  const me = await getSessionPersonId();
  if (!me) throw new Error("not logged in");
  await prisma.person.update({
    where: { id: me },
    data: {
      headline: form.headline,
      bio: form.bio,
      lookingFor: form.lookingFor,
      dealBreakers: form.dealBreakers,
      ...(form.recommendation !== undefined ? { recommendation: form.recommendation.trim().slice(0, 600) || null } : {}),
      ...(form.voucherName !== undefined ? { voucherName: form.voucherName.trim().slice(0, 120) || null } : {}),
      ...(form.voucherContact !== undefined ? { voucherContact: form.voucherContact.trim().slice(0, 200) || null } : {}),
    },
  });
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
  const actor = await getCurrentPerson();
  if (!actor || (actor.id !== personId && !actor.isOperator)) {
    throw new Error("not authorized");
  }
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: personId }, { blockedId: personId }] },
    select: { blockerId: true, blockedId: true },
  });
  const ids = new Set<string>();
  for (const r of rows) ids.add(r.blockerId === personId ? r.blockedId : r.blockerId);
  return [...ids];
}

// --- account rights: complete application (18+ + consent), delete account -----

// State returned to the apply form so validation problems render inline (next to
// the offending field) and the applicant keeps everything they already typed,
// instead of being thrown into the full-page error boundary. On success this
// action redirects and never returns.
export type ApplyState = {
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

export async function completeApplication(
  _prev: ApplyState,
  formData: FormData,
): Promise<ApplyState> {
  const me = await getCurrentPerson();
  if (!me) redirect("/login");

  const first = String(formData.get("first") || "").trim();
  const last = String(formData.get("last") || "").trim();
  const cityRaw = String(formData.get("city") || "");
  const city = cityRaw === "SF" || cityRaw.includes("Francisco") ? "SF" : "NYC";
  // One short line on what they want; the fast signup intentionally drops the
  // long free-form profile fields (headline/bio/deal-breakers).
  const lookingFor = String(formData.get("lookingFor") || "").trim().slice(0, 280);
  const email = me.email ?? "";
  const phoneRaw = String(formData.get("phone") || "");
  const phone = normalizePhone(phoneRaw);
  const linkedinRaw = String(formData.get("linkedin") || "");
  const instagramRaw = String(formData.get("instagram") || "");
  const linkedin = normalizeLinkedin(linkedinRaw);
  const instagram = normalizeInstagram(instagramRaw);
  const birthdateRaw = String(formData.get("birthdate") || "");
  const agreed = formData.get("agree") === "on";
  // SMS opt-in is separate and optional; only meaningful with a textable number.
  const smsConsent = formData.get("smsConsent") === "on";
  // Community recommendation: every applicant names someone who vouches for them.
  const voucherName = String(formData.get("voucherName") || "").trim().slice(0, 120);
  const voucherContact = String(formData.get("voucherContact") || "").trim().slice(0, 200);
  const recommendation = String(formData.get("recommendation") || "").trim().slice(0, 600);

  // Echo the entered values back so a re-render preserves them.
  const values = {
    first,
    last,
    email,
    city,
    lookingFor,
    phone: phoneRaw,
    linkedin: linkedinRaw,
    instagram: instagramRaw,
    birthdate: birthdateRaw,
    voucherName,
    voucherContact,
    recommendation,
  };

  const fieldErrors: Record<string, string> = {};
  if (!first) fieldErrors.first = "Enter your first name.";
  // Email is the baseline channel: it is how a match and you are introduced.
  if (!email.includes("@") || email.length > 254) {
    fieldErrors.email = "Enter a valid email so we can introduce you to your matches.";
  }
  // Phone is optional. It is only required when the applicant opts in to SMS
  // introductions, and it must be a real, textable mobile number when present.
  if (smsConsent && !phoneRaw.trim()) {
    fieldErrors.phone = "Add a mobile number to receive text introductions, or uncheck that option.";
  } else if (phoneRaw.trim() && !isTextablePhone(phone)) {
    fieldErrors.phone = "That does not look like a valid mobile number. Use a 10-digit number.";
  }
  const birthdate = birthdateRaw ? new Date(birthdateRaw) : null;
  if (!birthdate || Number.isNaN(birthdate.getTime())) {
    fieldErrors.birthdate = "Enter your date of birth.";
  } else {
    const age = Math.floor((Date.now() - birthdate.getTime()) / (365.25 * 24 * 3600 * 1000));
    if (age < 18) fieldErrors.birthdate = "You must be 18 or older to join Meet Cute.";
  }
  if (!agreed) fieldErrors.agree = "Please accept the Terms and Privacy Policy to continue.";
  // Meet Cute is vouched-for: every applicant names someone in the community.
  if (!voucherName) fieldErrors.voucherName = "Name someone in the community who can vouch for you.";
  if (!voucherContact) fieldErrors.voucherContact = "Add their email or phone so we can reach them.";

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values };
  }

  const age = Math.floor((Date.now() - birthdate!.getTime()) / (365.25 * 24 * 3600 * 1000));
  const name = `${first} ${last}`.trim() || me!.name;
  await prisma.person.update({
    where: { id: me!.id },
    // appliedAt stamps a genuine, completed application: it powers the operator's
    // accept-rate metric and separates real applicants from people who only
    // clicked a magic link and never finished.
    data: {
      name,
      city,
      lookingFor,
      phone,
      linkedin,
      instagram,
      birthdate,
      age,
      agreedTosAt: new Date(),
      // SMS opt-in is stamped only when they actually checked the separate box and
      // gave a textable number. Unchecking (or no number) leaves it null.
      smsConsentAt: smsConsent && isTextablePhone(phone) ? new Date() : null,
      appliedAt: me!.appliedAt ?? new Date(),
      voucherName,
      voucherContact,
      recommendation: recommendation || null,
    },
  });
  redirect("/apply/thanks");
}

// Member self-serve: opt in (or pause) being matched. This is the "yes, start
// matching me" toggle on the dashboard - the whole point of the return visit.
export async function setMatchOptIn(formData: FormData) {
  const me = await getSessionPersonId();
  if (!me) throw new Error("not logged in");
  const on = String(formData.get("on") || "") === "1";
  await prisma.person.update({
    where: { id: me },
    data: { openToMatch: on, optedInAt: on ? new Date() : null },
  });
  revalidatePath("/app");
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
    select: { id: true, storageUrl: true },
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
  await Promise.all(myPhotos.map((p) => deleteUpload(p.storageUrl, p.id)));

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
  await deleteUpload(photo.storageUrl, photo.id);
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
    // Revoke any live sessions so a removed member loses access immediately,
    // not at the end of the 30-day session TTL.
    await prisma.session.deleteMany({ where: { personId: id } });
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

// Operator: set their own mobile number. Used to add the matchmaker to the 3-way
// group intro thread when both applicants opt in. Without a number on file, the
// connection falls back to brokering each side the other's number.
export async function setOperatorPhone(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const phone = normalizePhone(String(formData.get("phone") || ""));
  if (!phone) throw new Error("Enter a valid mobile number.");
  await prisma.person.update({ where: { id: op.id }, data: { phone } });
  revalidatePath("/studio/team");
  revalidatePath("/studio/matchmaking");
}

// --- events (curated dinners) -----------------------------------------------

// Operator: create an event. Redirects to the event detail page to add invitees.
export async function createEvent(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");

  const city = String(formData.get("city") || "NYC");
  const venue = String(formData.get("venue") || "").trim();
  const theme = String(formData.get("theme") || "").trim();
  const dateRaw = String(formData.get("date") || "");
  const capacity = parseInt(String(formData.get("capacity") || "12"), 10);
  const notes = String(formData.get("notes") || "").trim();

  if (!venue) throw new Error("Add a venue.");
  const date = dateRaw ? new Date(dateRaw) : null;
  if (!date || Number.isNaN(date.getTime())) throw new Error("Pick a valid date and time.");

  const ev = await createEventRecord({ city, date, venue, theme, capacity, notes });
  revalidatePath("/studio/events");
  redirect(`/studio/events/${ev.id}`);
}

// Operator: one-click add invitees (checked members) to an event and email them.
export async function addEventInvitees(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const dinnerId = String(formData.get("dinnerId") || "");
  const ids = formData.getAll("memberId").map(String).filter(Boolean);
  if (!dinnerId) throw new Error("missing event");
  await inviteToEvent(dinnerId, ids);
  revalidatePath(`/studio/events/${dinnerId}`);
}

// Member: RSVP to an event they were invited to (their own attendee row only).
export async function setMyRsvp(formData: FormData) {
  const me = await getSessionPersonId();
  if (!me) throw new Error("not logged in");
  const attendeeId = String(formData.get("attendeeId") || "");
  const choice = String(formData.get("choice") || "");
  const status = choice === "confirmed" ? "confirmed" : choice === "declined" ? "declined" : null;
  if (!status) throw new Error("invalid RSVP");
  const att = await prisma.dinnerAttendee.findUnique({ where: { id: attendeeId } });
  if (!att || att.personId !== me) throw new Error("not your invitation");
  await prisma.dinnerAttendee.update({ where: { id: attendeeId }, data: { status } });
  revalidatePath("/app/events");
}

const ATTENDEE_STATUS = ["invited", "confirmed", "declined", "attended", "noshow"];

export async function setAttendeeStatus(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const id = String(formData.get("attendeeId") || "");
  const status = String(formData.get("status") || "");
  const att = await prisma.dinnerAttendee.update({
    where: { id },
    data: { status: ATTENDEE_STATUS.includes(status) ? status : "invited" },
  });
  revalidatePath(`/studio/events/${att.dinnerId}`);
}

export async function removeAttendee(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const id = String(formData.get("attendeeId") || "");
  const att = await prisma.dinnerAttendee.findUnique({ where: { id } });
  if (!att) return;
  await prisma.dinnerAttendee.delete({ where: { id } });
  revalidatePath(`/studio/events/${att.dinnerId}`);
}

const EVENT_STATUS = ["planned", "open", "full", "done"];

export async function setEventStatus(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const id = String(formData.get("dinnerId") || "");
  const status = String(formData.get("status") || "");
  await prisma.dinner.update({
    where: { id },
    data: { status: EVENT_STATUS.includes(status) ? status : "planned" },
  });
  revalidatePath("/studio/events");
  revalidatePath(`/studio/events/${id}`);
}

// Operator: log a note on a person or match.
export async function addNote(subjectId: string, body: string, kind = "general", matchId?: string) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  await prisma.note.create({ data: { subjectId, authorId: op.id, body: body.slice(0, 2000), kind, matchId } });
  revalidatePath(`/studio/person/${subjectId}`);
}

// Operator override: manually match any two members from a form, bypassing the
// candidate/compatibility filter (operators can match across the usual rules on
// purpose). Still blocks duplicates and respects member blocks.
export async function manualMatch(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const aId = String(formData.get("personAId") || "");
  const bId = String(formData.get("personBId") || "");
  const rationale = String(formData.get("rationale") || "").slice(0, 1000);
  if (!aId || !bId) throw new Error("Pick two members.");
  if (aId === bId) throw new Error("Pick two different members.");

  const existing = await prisma.match.findFirst({
    where: { OR: [{ personAId: aId, personBId: bId }, { personAId: bId, personBId: aId }] },
  });
  if (existing) throw new Error("These two are already in the pipeline.");
  const blocked = await prisma.block.findFirst({
    where: { OR: [{ blockerId: aId, blockedId: bId }, { blockerId: bId, blockedId: aId }] },
  });
  if (blocked) throw new Error("Cannot match: a block exists between these members.");

  await prisma.match.create({
    data: { personAId: aId, personBId: bId, createdById: op.id, stage: "suggested", rationale: rationale || null },
  });
  revalidatePath("/studio/pipeline");
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

// --- SMS introductions (operator-first matchmaking) -------------------------
//
// The lightweight flow: anyone the operator wants to match just needs a name and
// a phone (no profile, no login). The operator picks two people, sends each a
// "want an intro?" text, both reply Y, and the system connects them.

// Operator: quick-add a person who expressly asked to be matched. Email is the
// baseline channel. Texting requires a separate confirmation of SMS consent.
export async function quickAddPerson(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");

  const name = String(formData.get("name") || "").trim().slice(0, 80);
  const phone = normalizePhone(String(formData.get("phone") || ""));
  const cityRaw = String(formData.get("city") || "NYC");
  const city = cityRaw.toUpperCase().includes("SF") || cityRaw.includes("Francisco") ? "SF" : "NYC";
  const emailRaw = normalizeEmail(String(formData.get("email") || ""));
  const blurb = String(formData.get("blurb") || "").trim().slice(0, 1000);
  const linkedin = normalizeLinkedin(String(formData.get("linkedin") || ""));
  const instagram = normalizeInstagram(String(formData.get("instagram") || ""));
  const matchingConsent = formData.get("matchingConsent") === "on";
  const smsConsent = formData.get("smsConsent") === "on";

  if (!name) throw new Error("Add a name.");
  if (!matchingConsent) throw new Error("Confirm that this person asked to be added for matchmaking.");
  if (!emailRaw.includes("@") && !isTextablePhone(phone)) {
    throw new Error("Add an email or a valid mobile number.");
  }
  if (smsConsent && !isTextablePhone(phone)) {
    throw new Error("Add a valid mobile number before confirming text consent.");
  }
  if (!emailRaw.includes("@") && !smsConsent) {
    throw new Error("A phone-only person must expressly consent to text introductions.");
  }

  // De-dupe on the EXACT normalized number, and never match a privileged account
  // (operator/ambassador/coach): a matchee sharing a number with the operator
  // must not overwrite that operator's record. Substring matching is avoided so a
  // new add can't hijack an unrelated person whose number merely shares 10 digits.
  const existing = await prisma.person.findFirst({
    where: {
      ...(phone ? { phone } : { email: emailRaw }),
      isOperator: false,
      isAmbassador: false,
      isCoach: false,
    },
  });
  if (existing) {
    // Genuine same-person re-add: fill in details without clobbering existing
    // values when the operator left a field blank.
    await prisma.person.update({
      where: { id: existing.id },
      data: {
        name: name || existing.name,
        phone,
        city,
        bio: blurb || existing.bio,
        linkedin: linkedin ?? existing.linkedin,
        instagram: instagram ?? existing.instagram,
        openToMatch: true,
        optedInAt: existing.optedInAt ?? new Date(),
        ...(smsConsent ? { smsConsentAt: new Date() } : {}),
        ...(emailRaw.includes("@") ? { email: emailRaw } : {}),
      },
    });
  } else {
    await prisma.person.create({
      data: {
        name,
        phone,
        city,
        email: emailRaw.includes("@") ? emailRaw : null,
        bio: blurb || null,
        linkedin,
        instagram,
        status: "active",
        openToMatch: true,
        optedInAt: new Date(),
        smsConsentAt: smsConsent ? new Date() : null,
      },
    });
  }
  revalidatePath("/studio/matchmaking");
}

// Operator: start an introduction between two people. Creates the Match, marks
// both sides notified, and texts each the "want an intro?" message.
export async function createIntroduction(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");

  const aId = String(formData.get("personAId") || "");
  const bId = String(formData.get("personBId") || "");
  const blurb = String(formData.get("blurb") || "").trim().slice(0, 1000) || null;
  // Bullet text describing each person: aboutA describes A (shown to B), aboutB
  // describes B (shown to A). Newline-separated; each line becomes an SMS bullet.
  const aboutA = String(formData.get("aboutA") || "").trim().slice(0, 1000) || null;
  const aboutB = String(formData.get("aboutB") || "").trim().slice(0, 1000) || null;
  if (!aId || !bId) throw new Error("Pick two people.");
  if (aId === bId) throw new Error("Pick two different people.");

  const [a, b] = await Promise.all([
    prisma.person.findUnique({ where: { id: aId }, select: { id: true, name: true, phone: true, email: true, instagram: true, smsConsentAt: true, openToMatch: true, status: true } }),
    prisma.person.findUnique({ where: { id: bId }, select: { id: true, name: true, phone: true, email: true, instagram: true, smsConsentAt: true, openToMatch: true, status: true } }),
  ]);
  if (!a || !b) throw new Error("One of those people no longer exists.");
  if (a.status !== "active" || b.status !== "active" || !a.openToMatch || !b.openToMatch) {
    throw new Error("Both people must be approved and ready to match.");
  }
  // Email is the baseline opt-in channel (double opt-in link + Y/N reply); SMS is
  // sent only with separate SMS consent. Require one authorized channel each.
  if ((!a.email && !(a.phone && a.smsConsentAt)) || (!b.email && !(b.phone && b.smsConsentAt))) {
    throw new Error("Both people need an email or explicit text consent before you can introduce them.");
  }

  const existing = await prisma.match.findFirst({
    where: { OR: [{ personAId: aId, personBId: bId }, { personAId: bId, personBId: aId }] },
  });
  if (existing && !["exit", "connected"].includes(existing.stage)) {
    throw new Error("These two already have an open introduction.");
  }
  const blocked = await prisma.block.findFirst({
    where: { OR: [{ blockerId: aId, blockedId: bId }, { blockerId: bId, blockedId: aId }] },
  });
  if (blocked) throw new Error("Cannot connect: a block exists between these two.");

  const now = new Date();
  // Reuse the existing row when re-introducing a pair that previously closed or
  // connected: the (personAId, personBId) unique constraint means a blind create
  // would crash (P2002) or, in reverse order, create a duplicate the webhook
  // would then attach replies to nondeterministically. Reset it to a fresh invite.
  if (existing) {
    const aIsExistingA = existing.personAId === aId;
    await prisma.match.update({
      where: { id: existing.id },
      data: {
        createdById: op.id,
        stage: "invited",
        aDecision: "pending",
        bDecision: "pending",
        connectedAt: null,
        exitReason: null,
        lastActorId: null,
        rationale: blurb,
        // Keep about-bullets aligned with the existing row's A/B orientation.
        aboutPersonA: aIsExistingA ? aboutA : aboutB,
        aboutPersonB: aIsExistingA ? aboutB : aboutA,
        notifiedAAt: now,
        notifiedBAt: now,
      },
    });
  } else {
    await prisma.match.create({
      data: {
        personAId: aId,
        personBId: bId,
        createdById: op.id,
        stage: "invited",
        rationale: blurb,
        aboutPersonA: aboutA,
        aboutPersonB: aboutB,
        notifiedAAt: now,
        notifiedBAt: now,
      },
    });
  }

  // Each person sees the OTHER person's bullets + Instagram: A's invite describes
  // B (aboutB, b.instagram). SMS only fires when a phone is on file.
  const smsJobs: Promise<unknown>[] = [];
  if (a.phone && a.smsConsentAt) smsJobs.push(sendSMS({ to: a.phone, body: introInviteSMS({ toName: a.name, otherName: b.name, about: aboutB, otherInstagram: b.instagram, blurb, operatorName: op.name }) }));
  if (b.phone && b.smsConsentAt) smsJobs.push(sendSMS({ to: b.phone, body: introInviteSMS({ toName: b.name, otherName: a.name, about: aboutA, otherInstagram: a.instagram, blurb, operatorName: op.name }) }));
  await Promise.all(smsJobs);

  // Seed the transcript with the two invites so the operator console shows the
  // intro from its first message. Resolve the match id (created or reused above).
  const intro = await prisma.match.findFirst({
    where: { OR: [{ personAId: aId, personBId: bId }, { personAId: bId, personBId: aId }] },
    select: { id: true },
  });
  if (intro) {
    await Promise.all([
      logIntroMessage({ matchId: intro.id, body: `Invited ${a.name.split(" ")[0]}: want an intro to ${b.name.split(" ")[0]}? (Y/N)`, author: "bot", kind: "invite" }),
      logIntroMessage({ matchId: intro.id, body: `Invited ${b.name.split(" ")[0]}: want an intro to ${a.name.split(" ")[0]}? (Y/N)`, author: "bot", kind: "invite" }),
    ]);
    // Email double opt-in: link to the other's profile + Y/N reply. Best-effort.
    await sendEmailInvites(intro.id).catch(() => {});
  }

  revalidatePath("/studio/matchmaking");
  revalidatePath("/studio/conversations");
}

// Operator: re-send the "want an intro?" text to whoever hasn't replied yet.
export async function resendIntro(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const matchId = String(formData.get("matchId") || "");
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      personA: { select: { name: true, phone: true, instagram: true, smsConsentAt: true } },
      personB: { select: { name: true, phone: true, instagram: true, smsConsentAt: true } },
    },
  });
  if (!match) throw new Error("No such introduction.");

  const now = new Date();
  const jobs: Promise<unknown>[] = [];
  // Reuse the about bullets stored when the intro was created: A sees B (aboutB,
  // personB.instagram).
  if (match.aDecision === "pending" && match.personA.phone && match.personA.smsConsentAt) {
    jobs.push(sendSMS({ to: match.personA.phone, body: introInviteSMS({ toName: match.personA.name, otherName: match.personB.name, about: match.aboutPersonB, otherInstagram: match.personB.instagram, blurb: match.rationale, operatorName: op.name }) }));
  }
  if (match.bDecision === "pending" && match.personB.phone && match.personB.smsConsentAt) {
    jobs.push(sendSMS({ to: match.personB.phone, body: introInviteSMS({ toName: match.personB.name, otherName: match.personA.name, about: match.aboutPersonA, otherInstagram: match.personA.instagram, blurb: match.rationale, operatorName: op.name }) }));
  }
  await Promise.all(jobs);
  // Re-send the email double opt-in to whoever is still pending (rotates token).
  await sendEmailInvites(matchId).catch(() => {});
  await prisma.match.update({ where: { id: matchId }, data: { notifiedAAt: now, notifiedBAt: now } });
  revalidatePath("/studio/matchmaking");
  revalidatePath("/studio/conversations");
  revalidatePath(`/studio/conversations/${matchId}`);
}

// Public (no auth): a matched person taps Yes/Pass on the token-gated invite page
// (/i/[token]). Records the decision against the exact invite and revalidates the
// page so it re-renders in its decided state. Unknown/stale tokens are a no-op.
export async function decideInvite(formData: FormData) {
  const token = String(formData.get("token") || "");
  const raw = String(formData.get("decision") || "");
  if (!token || (raw !== "yes" && raw !== "pass")) return;
  await recordInviteDecision(token, raw as "yes" | "pass");
  revalidatePath(`/i/${token}`);
}

// Operator: close an introduction (either side passed, or it fizzled).
export async function closeIntroduction(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const matchId = String(formData.get("matchId") || "");
  await prisma.match.update({
    where: { id: matchId },
    data: { stage: "exit", exitReason: "operator_closed" },
  });
  revalidatePath("/studio/matchmaking");
  revalidatePath("/studio/conversations");
  revalidatePath(`/studio/conversations/${matchId}`);
}

// Operator bulk action: resend the "want an intro?" text to every stalled
// introduction (no reply for STALLED_DAYS+), texting only the side(s) still
// pending. Capped so one click can't fan out an unbounded number of sends.
export async function bulkResendStalled() {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");

  const stalled = await prisma.match.findMany({
    where: stalledWhere(),
    include: {
      personA: { select: { name: true, phone: true, instagram: true } },
      personB: { select: { name: true, phone: true, instagram: true } },
    },
    orderBy: { notifiedAAt: "asc" },
    take: 50,
  });

  const now = new Date();
  let resent = 0;
  for (const match of stalled) {
    const jobs: Promise<unknown>[] = [];
    if (match.aDecision === "pending" && match.personA.phone) {
      jobs.push(sendSMS({ to: match.personA.phone, body: introInviteSMS({ toName: match.personA.name, otherName: match.personB.name, about: match.aboutPersonB, otherInstagram: match.personB.instagram, blurb: match.rationale, operatorName: op.name }) }));
    }
    if (match.bDecision === "pending" && match.personB.phone) {
      jobs.push(sendSMS({ to: match.personB.phone, body: introInviteSMS({ toName: match.personB.name, otherName: match.personA.name, about: match.aboutPersonA, otherInstagram: match.personA.instagram, blurb: match.rationale, operatorName: op.name }) }));
    }
    if (jobs.length === 0) continue;
    await Promise.all(jobs);
    await prisma.match.update({ where: { id: match.id }, data: { notifiedAAt: now, notifiedBAt: now } });
    await logIntroMessage({ matchId: match.id, body: "Resent the intro invite (bulk nudge to whoever hadn't replied).", author: "operator", kind: "operator" });
    resent += 1;
  }

  revalidatePath("/studio/conversations");
  revalidatePath("/studio/matchmaking");
  redirect(`/studio/conversations?resent=${resent}`);
}

// Operator bulk action: close every introduction that expired (no reply for
// EXPIRED_DAYS+ and never mutual). One updateMany, then revalidate.
export async function bulkCloseExpired() {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");

  const res = await prisma.match.updateMany({
    where: expiredWhere(),
    data: { stage: "exit", exitReason: "expired" },
  });

  revalidatePath("/studio/conversations");
  revalidatePath("/studio/matchmaking");
  redirect(`/studio/conversations?closed=${res.count}`);
}

// Operator: force the connection now (e.g. both said yes by phone/in person).
export async function connectIntroNow(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const matchId = String(formData.get("matchId") || "");
  await prisma.match.update({
    where: { id: matchId },
    data: { aDecision: "yes", bDecision: "yes", stage: "mutual_yes" },
  });
  await connectMatch(matchId);
  revalidatePath("/studio/matchmaking");
}

// Operator: text both sides of a connection asking how it went, and schedule the
// next check-in a week out. Their replies land back as feedback notes.
export async function askForFeedback(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const matchId = String(formData.get("matchId") || "");
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      personA: { select: { name: true, phone: true, smsConsentAt: true } },
      personB: { select: { name: true, phone: true, smsConsentAt: true } },
    },
  });
  if (!match) throw new Error("No such introduction.");

  const jobs: Promise<unknown>[] = [];
  if (match.personA.phone && match.personA.smsConsentAt) {
    jobs.push(sendSMS({ to: match.personA.phone, body: feedbackRequestSMS({ toName: match.personA.name, otherName: match.personB.name, operatorName: op.name }) }));
  }
  if (match.personB.phone && match.personB.smsConsentAt) {
    jobs.push(sendSMS({ to: match.personB.phone, body: feedbackRequestSMS({ toName: match.personB.name, otherName: match.personA.name, operatorName: op.name }) }));
  }
  await Promise.all(jobs);
  await prisma.match.update({
    where: { id: matchId },
    data: { followUpAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
  });
  revalidatePath("/studio/matchmaking");
  revalidatePath(`/studio/conversations/${matchId}`);
}

// Operator: schedule (or clear) a follow-up reminder on an introduction.
export async function setIntroFollowUp(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const matchId = String(formData.get("matchId") || "");
  const days = parseInt(String(formData.get("days") || "0"), 10);
  await prisma.match.update({
    where: { id: matchId },
    data: { followUpAt: days > 0 ? new Date(Date.now() + days * 24 * 3600 * 1000) : null },
  });
  revalidatePath("/studio/matchmaking");
}

// Operator: "jump in" to an introduction's group thread. Posts into the live
// Twilio group conversation when one exists; otherwise falls back to texting
// both participants the same message. Logged to the transcript either way.
export async function messageGroup(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const matchId = String(formData.get("matchId") || "");
  const message = String(formData.get("message") || "").trim().slice(0, 480);
  if (!message) throw new Error("Write a message first.");

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      personA: { select: { name: true, phone: true, smsConsentAt: true } },
      personB: { select: { name: true, phone: true, smsConsentAt: true } },
    },
  });
  if (!match) throw new Error("No such introduction.");

  let delivered = false;
  if (match.conversationSid && match.personA.smsConsentAt && match.personB.smsConsentAt) {
    const res = await sendConversationMessage({ conversationSid: match.conversationSid, body: message });
    delivered = res.ok;
  }
  if (!delivered) {
    // No live group thread (or send failed): text each side directly.
    const jobs: Promise<unknown>[] = [];
    if (match.personA.phone && match.personA.smsConsentAt) jobs.push(sendSMS({ to: match.personA.phone, body: message }));
    if (match.personB.phone && match.personB.smsConsentAt) jobs.push(sendSMS({ to: match.personB.phone, body: message }));
    await Promise.all(jobs);
  }

  await logIntroMessage({
    matchId,
    body: message,
    direction: "out",
    author: op.name.split(" ")[0],
    personId: op.id,
    kind: "operator",
  });
  revalidatePath(`/studio/conversations/${matchId}`);
  revalidatePath("/studio/conversations");
}

// Operator: send a free-form text to one person (notify / nudge / check in).
export async function messagePerson(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const personId = String(formData.get("personId") || "");
  const message = String(formData.get("message") || "").trim().slice(0, 480);
  if (!message) throw new Error("Write a message first.");
  const person = await prisma.person.findUnique({ where: { id: personId }, select: { phone: true, smsConsentAt: true } });
  if (!person?.phone) throw new Error("That person has no phone number on file.");
  if (!person.smsConsentAt) throw new Error("That person has not consented to text messages.");
  const result = await sendSMS({ to: person.phone, body: message });
  if (!result.ok) throw new Error("The text could not be delivered.");
  // Log it so the thread is auditable from the person's record.
  await prisma.note.create({ data: { subjectId: personId, authorId: op.id, body: `[SMS sent] ${message}`, kind: "general" } });
  revalidatePath("/studio/matchmaking");
}
