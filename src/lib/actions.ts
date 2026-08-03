"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "./prisma";
import {
  setSession,
  clearSession,
  getSessionPersonId,
  getCurrentPerson,
  requireOperator,
  requireSuperAdmin,
  createLoginToken,
  normalizeEmail,
  purgeExpiredAuth,
} from "./auth";
import {
  sendEmail,
  magicLinkEmail,
  applicationReceivedEmail,
  applicationApprovedEmail,
  matchReminderEmail,
  matchFeedbackEmail,
  operatorLeadEmail,
  requestReceivedEmail,
  recommendationRequestEmail,
  recommendationReceivedEmail,
  recommendationThanksEmail,
  recommenderFollowUpEmail,
  vouchBackRequestEmail,
} from "./email";
import {
  FOLLOW_UP_DELAY_MS,
  REMINDER_SCHEDULE_MS,
  REQUIRED_RECOMMENDATIONS,
  acceptIfRecommended,
  fastTrackFor,
  gateState,
  isGender,
  linkRecommenderSignup,
  newRecommendationToken,
  recordAnswer,
  recommendationReplyTo,
  recommendationUrl,
  requiredNewRecommenders,
  saveRecommenders,
  syncLeadRecommendation,
  type RecommenderInput,
} from "./recommendations";
import {
  normalizePhone,
  normalizeInstagram,
  normalizeLinkedin,
  feedbackRequestSMS,
  feedbackRequestTemplate,
} from "./sms";
import { connectMatch, logIntroMessage, stalledWhere, expiredWhere, sendEmailInvites, recordInviteDecision, LIVE_INTRO_STAGES, introReturnPath } from "./introductions";
import { rateLimit } from "./ratelimit";
import { calendarAge, parseCalendarDate } from "./age";
import { formatEventDay, parseEventDate } from "./event-time";
import { mutualFriends } from "./social";
import { deleteUpload } from "./uploads";
import {
  createEventRecord,
  inviteToEvent,
  removeDinnerAttendee,
  setDinnerAttendeeStatus,
} from "./events";
import { allowMemberDemoLogin, allowOperatorDemoLogin } from "./demo-login";
import {
  cancelScheduledMail,
  makeDeliveryKey,
  queueConversationDelivery,
  queueEmailDelivery,
  queueSmsDelivery,
  retryFailedDeliveryJob,
} from "./delivery";
import {
  provisionOperatorAccount,
  revokeOperatorAccount,
  setNonOperatorMemberStatus,
} from "./operator-access";
import { deleteNonOperatorPersonRecord } from "./account-deletion";

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

function newDeliveryNonce(): string {
  return randomBytes(12).toString("hex");
}

function deliveryWindow(): string {
  return String(Math.floor(Date.now() / (5 * 60_000)));
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

  // Every branch below has to be reflected back to the requester. This used to
  // redirect to `sent=1` unconditionally, so a typo'd address, a throttled
  // request, a missing NEXT_PUBLIC_APP_URL, and a hard provider failure all
  // rendered "check your email" for a link that was never sent. There is no
  // enumeration concern here: this endpoint mails any address, so it reveals
  // nothing about who has an account. (requestOperatorMagicLink below is the
  // opposite case and deliberately stays silent.)
  let outcome: "sent" | "email" | "throttled" | "send" = "sent";
  if (!validEmail) {
    outcome = "email";
  } else if (!ipOk || !emailOk) {
    outcome = "throttled";
  } else if (!base) {
    console.error("[auth] NEXT_PUBLIC_APP_URL must be set in production to send magic links");
    outcome = "send";
  } else {
    const token = await createLoginToken(email);
    const link = `${base}/auth/verify?token=${encodeURIComponent(token)}`;
    const { subject, html, text } = magicLinkEmail(link);
    const result = await sendEmail({ to: email, subject, html, text });
    if (!result.ok) {
      console.error("[auth] magic link send failed:", result.error);
      outcome = "send";
    }
    void purgeExpiredAuth();
  }

  const rawAfter = String(formData.get("after") || "/login");
  const after = rawAfter.startsWith("/") && !rawAfter.startsWith("//") ? rawAfter : "/login";
  const base_ = after.split("?")[0];
  const param = outcome === "sent" ? "sent=1" : `error=${outcome}`;
  redirect(`${base_}?${param}`);
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
    await connectMatch(matchId);
  }
  revalidatePath("/app");
  revalidatePath("/app/matches");
  revalidatePath("/studio/pipeline");
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
      prompt: `${meName} & ${otherName} just matched on Mutuals and you know them both. Any words?`,
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
  await prisma.$transaction(async (tx) => {
    await tx.block.upsert({
      where: { blockerId_blockedId: { blockerId: me, blockedId } },
      create: { blockerId: me, blockedId },
      update: {},
    });
    const matches = await tx.match.findMany({
      where: {
        OR: [
          { personAId: me, personBId: blockedId },
          { personAId: blockedId, personBId: me },
        ],
      },
      select: { id: true },
    });
    const matchIds = matches.map((match) => match.id);
    await tx.match.updateMany({
      where: { id: { in: matchIds } },
      data: { stage: "exit", exitReason: "blocked" },
    });
    await tx.deliveryJob.updateMany({
      where: {
        matchId: { in: matchIds },
        status: { in: ["pending", "processing", "failed"] },
      },
      data: {
        status: "cancelled",
        lockedAt: null,
        leaseToken: null,
        lastError: "Cancelled because a block now exists between the members.",
      },
    });
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
  // Gender is what the opposite-gender recommendation rule is checked against,
  // and it is also the field the matchmaker filters on. It was never collected
  // here: every one of the 25 people on the roster had a null gender.
  const gender = String(formData.get("gender") || "").trim();
  // One line from the applicant, carried into the ask. A note from the person
  // themselves converts better than any system copy, because it is the only
  // part of that email they wrote.
  const applicantNote = String(formData.get("applicantNote") || "").trim().slice(0, 200);
  // Someone who has already vouched for a member needs one new friend, not two:
  // the member they vouched for counts as the other. That credit is what makes
  // a recommender worth converting, and it is checked on the server rather than
  // trusted from the form.
  const fastTrack = await fastTrackFor(email, gender);
  const needed = requiredNewRecommenders(fastTrack);

  // The friends who have to write back before this application is accepted.
  const recommenders = [1, 2].slice(0, needed).map((slot) => ({
    name: String(formData.get(`rec${slot}Name`) || "").trim().slice(0, 120),
    email: String(formData.get(`rec${slot}Email`) || "").trim().toLowerCase().slice(0, 254),
    gender: String(formData.get(`rec${slot}Gender`) || "").trim(),
  }));

  // Echo the entered values back so a re-render preserves them.
  const values: Record<string, string> = {
    first,
    last,
    email,
    city,
    gender,
    lookingFor,
    phone: phoneRaw,
    linkedin: linkedinRaw,
    instagram: instagramRaw,
    birthdate: birthdateRaw,
    applicantNote,
  };
  recommenders.forEach((r, i) => {
    values[`rec${i + 1}Name`] = r.name;
    values[`rec${i + 1}Email`] = r.email;
    values[`rec${i + 1}Gender`] = r.gender;
  });

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
  const birthParts = birthdateRaw ? parseCalendarDate(birthdateRaw) : null;
  const birthdate = birthParts ? new Date(Date.UTC(birthParts.y, birthParts.m - 1, birthParts.d)) : null;
  if (!birthParts || !birthdate) {
    fieldErrors.birthdate = "Enter your date of birth.";
  } else if (calendarAge(birthParts) < 18) {
    fieldErrors.birthdate = "You must be 18 or older to join Mutuals.";
  }
  if (!agreed) fieldErrors.agree = "Please accept the Terms and Privacy Policy to continue.";
  if (!isGender(gender)) fieldErrors.gender = "Tell us how you identify so we can match you.";

  // A photo is required. It used to be encouraged, and 10 of the 25 people on
  // the roster had none, so half the introductions went out with initials where
  // a face should be. The check is here rather than only in the browser because
  // the uploader posts to /api/photos on its own, outside this form.
  const photoCount = await prisma.photo.count({
    where: { personId: me!.id, status: "approved" },
  });
  if (photoCount === 0) {
    fieldErrors.photos = "Add at least one photo. Your matchmaker and your introduction both need a face.";
  }

  // Two friends of the opposite gender. This is the gate: naming them is what
  // an application IS now, so the errors have to be specific enough to fix.
  const seen = new Set<string>();
  recommenders.forEach((person, i) => {
    const slot = i + 1;
    if (!person.name) fieldErrors[`rec${slot}Name`] = "Add their name.";
    if (!isValidEmail(person.email)) {
      fieldErrors[`rec${slot}Email`] = "Add their email so we can ask them.";
    } else if (person.email === normalizeEmail(email)) {
      fieldErrors[`rec${slot}Email`] = "This has to be someone else's email, not your own.";
    } else if (seen.has(person.email)) {
      fieldErrors[`rec${slot}Email`] = "You have already named this person.";
    }
    seen.add(person.email);
    if (!isGender(person.gender)) fieldErrors[`rec${slot}Gender`] = "Pick one.";
  });
  // The opposite-gender rule, checked once both slots are otherwise valid.
  // Nonbinary applicants have no opposite to require, so they need the two
  // recommendations and nothing more.
  if (isGender(gender) && (gender === "woman" || gender === "man")) {
    const wanted = gender === "woman" ? "man" : "woman";
    recommenders.forEach((person, i) => {
      const slot = i + 1;
      if (isGender(person.gender) && person.gender !== wanted) {
        fieldErrors[`rec${slot}Gender`] =
          wanted === "man"
            ? `Your ${needed === 1 ? "recommendation has" : "recommendations have"} to come from men.`
            : `Your ${needed === 1 ? "recommendation has" : "recommendations have"} to come from women.`;
      }
    });
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values };
  }

  const age = calendarAge(birthParts!);
  const name = `${first} ${last}`.trim() || me!.name;
  await prisma.person.update({
    where: { id: me!.id },
    // appliedAt stamps a genuine, completed application: it powers the operator's
    // accept-rate metric and separates real applicants from people who only
    // clicked a magic link and never finished.
    data: {
      name,
      city,
      gender,
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
    },
  });

  // This applicant may be a recommender who came back. Stamp the rows they
  // wrote with the person they became (the only way the loop is measurable),
  // write the member-to-member Vouch, and stop the follow-up that was going to
  // ask them to do the thing they have now done.
  const convertedFrom = await linkRecommenderSignup({ id: me!.id, email });
  if (convertedFrom > 0) await cancelScheduledMail("recommender_follow_up", email);

  // Ask the friends. Queued, like every other send, so a provider hiccup
  // retries rather than stranding an application nobody can complete.
  const saved = await saveRecommenders(me!.id, recommenders as RecommenderInput[], applicantNote);
  await queueRecommendationRequests(saved, name, city);

  // The credited half: the member they vouched for is asked to vouch back. It
  // is a real request with a real token, so it shows on the waiting page and
  // counts toward the gate exactly like any other.
  if (fastTrack) {
    const already = await prisma.recommendation.findUnique({
      where: { applicantId_email: { applicantId: me!.id, email: fastTrack.member.email ?? "" } },
    });
    if (!already && fastTrack.member.email) {
      const request = await prisma.recommendation.create({
        data: {
          applicantId: me!.id,
          name: fastTrack.member.name,
          email: fastTrack.member.email,
          gender: fastTrack.member.gender ?? "nonbinary",
          token: newRecommendationToken(),
          requestedAt: new Date(),
        },
      });
      try {
        const msg = vouchBackRequestEmail({
          memberName: request.name,
          applicantName: name,
          link: recommendationUrl(request.token),
        });
        await queueEmailDelivery({
          kind: "vouch_back_request",
          to: request.email,
          subject: msg.subject,
          html: msg.html,
          text: msg.text,
          personId: fastTrack.member.id,
          idempotencyKey: makeDeliveryKey("vouch_back_request", request.token),
        });
      } catch (error) {
        console.error(`[flywheel] could not ask for a vouch back: ${(error as Error).message}`);
      }
    }
  }

  // Confirm receipt. Queued rather than sent inline so a provider hiccup retries
  // instead of silently dropping the applicant's only confirmation. The
  // application itself is already committed above, so this never blocks it.
  if (email.includes("@")) {
    try {
      const msg = applicationReceivedEmail({
        name,
        city,
        recommenders: saved.map((r) => ({ name: r.name, status: r.status })),
        statusUrl: `${appBaseUrl()}/apply/thanks`,
      });
      await queueEmailDelivery({
        kind: "application_received",
        to: email,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        personId: me!.id,
        idempotencyKey: makeDeliveryKey("application_received", me!.id),
      });
    } catch (error) {
      console.error(`[apply] could not queue confirmation: ${(error as Error).message}`);
    }
  }

  redirect("/apply/thanks");
}

// --- recommendations ---------------------------------------------------------

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://hellomutuals.com").replace(/\/$/, "");
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 254;
}

/**
 * Queue the "please vouch for X" email for each outstanding request.
 *
 * personId is deliberately NOT set on these jobs. It is the applicant's id, not
 * the recipient's, and deliveryEligibility refuses to send an email whose
 * recipient is not that person's own address - which is exactly right for every
 * other email in the system and exactly wrong for this one. The idempotency key
 * covers the token, so a job is queued once per request and a re-sent request
 * (new token) is a new job.
 */
async function queueRecommendationRequests(
  requests: {
    id: string;
    token: string;
    name: string;
    email: string;
    status: string;
    applicantNote?: string | null;
  }[],
  applicantName: string,
  applicantCity: string | null,
  options: { reminder?: boolean } = {},
): Promise<number> {
  let queued = 0;
  for (const request of requests) {
    if (request.status === "submitted") continue;
    try {
      const msg = recommendationRequestEmail({
        recommenderName: request.name,
        applicantName,
        applicantCity,
        link: recommendationUrl(request.token),
        reminder: options.reminder,
        applicantNote: request.applicantNote,
        replyToVouch: true,
      });
      await queueEmailDelivery({
        kind: options.reminder ? "recommendation_reminder" : "recommendation_request",
        to: request.email,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        replyTo: recommendationReplyTo(request.token),
        idempotencyKey: makeDeliveryKey(
          options.reminder ? "recommendation_reminder" : "recommendation_request",
          request.token,
          options.reminder ? String(Date.now()) : "",
        ),
      });
      await prisma.recommendation.update({
        where: { id: request.id },
        data: options.reminder ? { remindedAt: new Date() } : { requestedAt: new Date() },
      });

      // Schedule the nudge at the same time as the ask, to be sent in two days
      // unless they have written back by then. Reply rate is one of the two
      // numbers the whole loop multiplies, and leaving the only nudge as a
      // button the applicant has to find means half of them never get one:
      // of the two people who applied through the gate on the day it shipped,
      // one pressed it and one did not.
      if (!options.reminder) {
        // Three, not one. Reply rate is one of only two numbers this loop
        // multiplies, and a single nudge at two days catches the people who
        // meant to answer and forgot but nobody else. All three are withdrawn
        // the moment they answer, by kind, in one call.
        for (const [index, delay] of REMINDER_SCHEDULE_MS.entries()) {
          const nudge = recommendationRequestEmail({
            recommenderName: request.name,
            applicantName,
            applicantCity,
            link: recommendationUrl(request.token),
            reminder: true,
            applicantNote: request.applicantNote,
            replyToVouch: true,
          });
          await queueEmailDelivery({
            kind: "recommendation_reminder",
            to: request.email,
            subject: nudge.subject,
            html: nudge.html,
            text: nudge.text,
            replyTo: recommendationReplyTo(request.token),
            idempotencyKey: makeDeliveryKey("recommendation_reminder", request.token, `auto${index}`),
            availableAt: new Date(Date.now() + delay),
          });
        }
      }
      queued += 1;
    } catch (error) {
      console.error(`[recommendations] could not queue request: ${(error as Error).message}`);
    }
  }
  return queued;
}

/** Applicant-triggered nudge from the waiting page. Rate limited: a friend who
 *  is being emailed every ten minutes stops reading the emails. */
export async function nudgeRecommenders(): Promise<void> {
  const me = await getCurrentPerson();
  if (!me) redirect("/login");
  const limit = await rateLimit(`nudge:${me.id}`, 3, 60 * 60 * 1000);
  if (!limit.ok) return;
  const state = await gateState(me.id);
  await queueRecommendationRequests(state.outstanding, me.name, me.city, { reminder: true });
  revalidatePath("/apply/thanks");
}

export type RecommendationState = {
  error?: string;
  values?: { body?: string; relationship?: string };
};

/**
 * A friend writes the recommendation. No session: the token in the URL is the
 * authorization, and it stops working once answered so a forwarded link cannot
 * overwrite what they wrote.
 */
export async function submitRecommendation(
  _prev: RecommendationState,
  formData: FormData,
): Promise<RecommendationState> {
  const token = String(formData.get("token") || "");
  const body = String(formData.get("body") || "").trim().slice(0, 1200);
  const relationship = String(formData.get("relationship") || "").trim().slice(0, 160);
  const values = { body, relationship };

  if (!token) return { error: "This link is not valid any more.", values };
  if (body.length < 40) {
    return {
      error: "A couple of sentences, please. Or use the one-tap vouch above if you would rather not write.",
      values,
    };
  }

  const answer = await recordAnswer(token, { body, relationship });
  if (!answer.ok) {
    if (answer.reason === "unknown") return { error: "This link is not valid any more.", values };
    redirect(`/r/${token}?done=1`);
  }
  await afterRecommendationAnswer(token, answer);
  redirect(`/r/${token}?done=1`);
}

/**
 * The one-tap vouch.
 *
 * Most people answering this are on a phone, and the difference between a tap
 * and a paragraph is the difference between an answer today and an answer
 * never. A tap counts toward the gate; it does not put words in anyone's mouth,
 * so only a written recommendation is ever quoted on a profile. The page then
 * asks for the words anyway, which is when most of them arrive.
 */
export async function endorseRecommendation(formData: FormData): Promise<void> {
  const token = String(formData.get("token") || "");
  if (!token) return;
  const answer = await recordAnswer(token, { endorseOnly: true });
  if (!answer.ok) redirect(`/r/${token}?done=1`);
  await afterRecommendationAnswer(token, answer);
  redirect(`/r/${token}?vouched=1`);
}

/**
 * Everything that happens once a friend has answered, whichever door they came
 * through: the page, the tap, or a plain reply to the email.
 */
export async function afterRecommendationAnswer(
  token: string,
  answer: Extract<Awaited<ReturnType<typeof recordAnswer>>, { ok: true }>,
): Promise<void> {
  const { request, applicant, alreadyAnswered } = answer;

  // Every queued nudge for this friend, withdrawn in one call.
  await cancelScheduledMail("recommendation_reminder", request.email);

  const outcome = await acceptIfRecommended(request.applicantId);
  // Also for someone who is already a member. acceptIfRecommended only copies
  // the quote on the way in, so a recommendation written after an operator
  // approved the applicant never reached the profile or the introduction.
  await syncLeadRecommendation(request.applicantId);

  try {
    if (outcome.justAccepted && applicant.email) {
      const msg = applicationApprovedEmail({ name: applicant.name, appUrl: `${appBaseUrl()}/app/profile` });
      await queueEmailDelivery({
        kind: "application_approved",
        to: applicant.email,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        personId: applicant.id,
        idempotencyKey: makeDeliveryKey("application_approved", applicant.id),
      });
    } else if (!outcome.accepted && applicant.email) {
      const msg = recommendationReceivedEmail({
        name: applicant.name,
        recommenderName: request.name,
        remaining: outcome.remaining || REQUIRED_RECOMMENDATIONS,
        statusUrl: `${appBaseUrl()}/apply/thanks`,
      });
      await queueEmailDelivery({
        kind: "recommendation_received",
        to: applicant.email,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        personId: applicant.id,
        idempotencyKey: makeDeliveryKey("recommendation_received", request.id),
      });
    }

    // Thanking someone twice for the same favour reads as a broken system, so
    // the thanks and the follow-up are keyed to the request and skipped when a
    // tap has already been answered for.
    if (!alreadyAnswered) {
      const thanks = recommendationThanksEmail({
        recommenderName: request.name,
        applicantName: applicant.name,
        accepted: outcome.accepted,
        applyUrl: `${appBaseUrl()}/apply`,
      });
      await queueEmailDelivery({
        kind: "recommendation_thanks",
        to: request.email,
        subject: thanks.subject,
        html: thanks.html,
        text: thanks.text,
        idempotencyKey: makeDeliveryKey("recommendation_thanks", request.id),
      });

      const alreadyMember = await prisma.person.findUnique({
        where: { email: request.email },
        select: { appliedAt: true },
      });
      if (!alreadyMember?.appliedAt) {
        const followUp = recommenderFollowUpEmail({
          recommenderName: request.name,
          applicantName: applicant.name,
          accepted: outcome.accepted,
          applyUrl: `${appBaseUrl()}/apply?from=${encodeURIComponent(token)}`,
        });
        await queueEmailDelivery({
          kind: "recommender_follow_up",
          to: request.email,
          subject: followUp.subject,
          html: followUp.html,
          text: followUp.text,
          idempotencyKey: makeDeliveryKey("recommender_follow_up", request.id),
          availableAt: new Date(Date.now() + FOLLOW_UP_DELAY_MS),
        });
      }
    }
  } catch (error) {
    // The answer is committed. Mail is a courtesy on top of it and must never
    // cost the friend the thing they just took the trouble to give.
    console.error(`[recommendations] could not queue follow-up: ${(error as Error).message}`);
  }

  revalidatePath("/apply/thanks");
  revalidatePath(`/studio/person/${request.applicantId}`);
}

/** Permanently delete the signed-in member and all of their data. */
export async function deleteAccount() {
  const person = await getCurrentPerson();
  if (!person) throw new Error("not logged in");
  if (person.isOperator) {
    throw new Error("Operator accounts must be revoked before they can be deleted.");
  }
  const me = person.id;

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

  await prisma.$transaction(async (tx) => {
    // Notes that reference me, my matches, or were authored by me (operators).
    await tx.note.deleteMany({
      where: { OR: [{ subjectId: me }, { authorId: me }, { matchId: { in: matchIds } }] },
    });
    // References tied to me (requester/friend are plain ids, no cascade).
    await tx.reference.deleteMany({ where: { OR: [{ requesterId: me }, { friendId: me }] } });
    // My matches (cascades concierge threads, messages, remaining references).
    await tx.match.deleteMany({ where: { OR: [{ personAId: me }, { personBId: me }] } });
    // Vouches in either direction.
    await tx.vouch.deleteMany({ where: { OR: [{ voucherId: me }, { subjectId: me }] } });
    // Referrals I sent; detach invites/referrals that point at me.
    await tx.referral.deleteMany({ where: { inviterId: me } });
    await tx.referral.updateMany({ where: { inviteeId: me }, data: { inviteeId: null } });
    await tx.person.updateMany({ where: { referredById: me }, data: { referredById: null } });
    // Coaching engagements I am part of.
    await tx.coachingEngagement.deleteMany({
      where: { OR: [{ clientId: me }, { coachId: me }] },
    });
    // The role condition closes the race where this member is promoted while
    // deletion is in flight. Throwing rolls back every preceding deletion.
    await deleteNonOperatorPersonRecord(tx, me);
  });

  // Free the photo objects from the store after the rows are gone.
  await Promise.all(myPhotos.map((p) => deleteUpload(p.storageUrl, p.id)));

  await clearSession();
  redirect("/?deleted=1");
}

// Operator: take a photo down after the fact.
//
// There is no pre-publication review any more: a member's upload is live
// immediately, so nothing needs approving. This is the reverse operation, and
// it is the only remaining moderation control: if a photo is reported, or is
// obviously not the member, an operator hides it and every surface stops
// showing it because they all filter on "approved". The member's row is left in
// place rather than deleted so the action is reversible from the database.
export async function hidePhoto(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const id = String(formData.get("photoId") || "");
  const photo = await prisma.photo.update({
    where: { id },
    data: { status: "rejected" },
    select: { personId: true },
  });
  revalidatePath(`/studio/person/${photo.personId}`);
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
  revalidatePath("/studio");
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
  if (!id || !["approve", "decline"].includes(action)) throw new Error("invalid status change");

  // Approving before the recommendations are in is allowed, and it is the one
  // thing that quietly empties the gate: on the day it shipped, both applicants
  // were let in by hand before their friends wrote, so three of four
  // recommenders had no reason to answer and the loop had no fuel. It stays
  // possible and stops being invisible. A reason is required and recorded.
  const reason = String(formData.get("reason") || "").trim().slice(0, 280);
  if (action === "approve") {
    const gate = await gateState(id);
    if (!gate.satisfied && gate.recommendations.length > 0 && !reason) {
      throw new Error(
        `${gate.remaining} of ${REQUIRED_RECOMMENDATIONS} recommendations are still outstanding. Give a reason to override the gate.`,
      );
    }
  }

  const change = await setNonOperatorMemberStatus(
    op.id,
    id,
    action as "approve" | "decline",
    reason || null,
  );

  // Welcome the new member: "you're in, you'll start getting matches." Queued
  // through the outbox so a provider hiccup retries instead of stranding the
  // approval. Best-effort - the status change already committed.
  if (change.action === "approve" && change.email) {
    try {
      const base = (process.env.NEXT_PUBLIC_APP_URL || "https://hellomutuals.com").replace(/\/$/, "");
      const msg = applicationApprovedEmail({ name: change.name, appUrl: `${base}/app` });
      await queueEmailDelivery({
        kind: "application_approved",
        to: change.email,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        idempotencyKey: makeDeliveryKey("application-approved", id, change.email),
        personId: id,
      });
    } catch (error) {
      console.error(`[studio] approval email failed: ${(error as Error).message}`);
    }
  }

  revalidatePath("/studio");
}

// --- operator (admin) accounts ----------------------------------------------
//
// There is one login mechanism for everyone (magic link by email). Person.isOperator
// unlocks the studio, while Person.isSuperAdmin grants the narrower authority to
// add or revoke operator accounts.

// Super admin: add another operator by email. Creates the account if new,
// promotes it if it exists, and emails them a sign-in link.
export async function addOperator(formData: FormData) {
  const superAdmin = await requireSuperAdmin();
  if (!superAdmin) throw new Error("super admins only");

  const email = normalizeEmail(String(formData.get("email") || ""));
  if (!email.includes("@") || email.length > 254) throw new Error("Enter a valid email.");
  const rawName = String(formData.get("name") || "").trim().slice(0, 60);
  const city = String(formData.get("city") || "").includes("Francisco") ? "SF" : "NYC";

  const existing = await prisma.person.findUnique({
    where: { email },
    select: { name: true },
  });
  const name = existing?.name || rawName;
  if (!name) throw new Error("Enter the operator's full name.");

  const operator = await provisionOperatorAccount({
    actorId: superAdmin.id,
    email,
    name,
    city,
  });

  // Email a one-time sign-in link. If delivery fails, the account still exists
  // and the Team page tells the super admin to have them request a fresh link.
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  let inviteStatus = "created";
  if (base) {
    try {
      const token = await createLoginToken(email);
      const link = `${base}/auth/verify?token=${encodeURIComponent(token)}`;
      const { subject, html, text } = magicLinkEmail(link);
      const result = await sendEmail({ to: email, subject, html, text });
      inviteStatus = result.ok ? "sent" : "failed";
    } catch {
      inviteStatus = "failed";
    }
  }

  revalidatePath("/studio/team");
  redirect(`/studio/team?invite=${inviteStatus}&operator=${encodeURIComponent(operator.name)}`);
}

// Super admin: revoke ordinary operator access. Keeps the person/account and
// guards against removing yourself or another super admin.
export async function removeOperator(formData: FormData) {
  const superAdmin = await requireSuperAdmin();
  if (!superAdmin) throw new Error("super admins only");
  const id = String(formData.get("personId") || "");
  if (!id) throw new Error("missing operator");
  if (id === superAdmin.id) throw new Error("You cannot revoke your own operator access.");

  const operator = await revokeOperatorAccount(superAdmin.id, id);
  revalidatePath("/studio/team");
  redirect(
    `/studio/team?access=revoked&operator=${encodeURIComponent(operator.name)}`,
  );
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
  // datetime-local posts a naive wall clock. Read it in the dinner's city, not
  // in the server's zone, which on Fly is UTC and shifted every NYC dinner by
  // four hours.
  const date = dateRaw ? parseEventDate(dateRaw, city) : null;
  if (!date) throw new Error("Pick a valid date and time.");

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
  await setDinnerAttendeeStatus(attendeeId, status);
  revalidatePath("/app/events");
}

export async function setAttendeeStatus(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const id = String(formData.get("attendeeId") || "");
  const status = String(formData.get("status") || "");
  const att = await setDinnerAttendeeStatus(id, status);
  revalidatePath(`/studio/events/${att.dinnerId}`);
}

export async function removeAttendee(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const id = String(formData.get("attendeeId") || "");
  const dinnerId = await removeDinnerAttendee(id);
  if (dinnerId) revalidatePath(`/studio/events/${dinnerId}`);
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

export async function retryDeliveryJob(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const id = String(formData.get("deliveryJobId") || "");
  if (!id) throw new Error("missing delivery job");
  await retryFailedDeliveryJob(id);
  revalidatePath("/studio");
  revalidatePath("/studio/delivery");
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
  // An operator clicking a pair that already has a match, or a pair that has
  // blocked each other, is an ordinary thing to do, not a crash. Throwing here
  // dropped the operator on the generic error page and raised a Sentry issue,
  // so report the outcome on the page they came from instead.
  if (existing) redirect(`/studio/person/${aId}?suggest=exists`);
  // Never suggest a pair where either has blocked the other.
  const blocked = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: aId, blockedId: bId },
        { blockerId: bId, blockedId: aId },
      ],
    },
  });
  if (blocked) redirect(`/studio/person/${aId}?suggest=blocked`);
  await prisma.match.create({
    data: { personAId: aId, personBId: bId, rationale, createdById: me ?? undefined, stage: "suggested" },
  });
  revalidatePath("/studio/pipeline");
  revalidatePath(`/studio/person/${aId}`);
  redirect(`/studio/person/${aId}?suggest=created`);
}

// --- operator-led introductions ---------------------------------------------
//
// The lightweight flow: anyone the operator wants to match needs a name and one
// authorized delivery channel. The operator picks two people and sends each a
// private introduction. The system connects them after a mutual yes.

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
// Every reason an introduction can be refused is an ordinary operator mistake
// made against a page that went stale, not a crash. Throwing sent the operator
// to the generic "Something went sideways." boundary with no idea which of the
// eight checks rejected them, and raised a Sentry issue per click. Report the
// outcome on the page they sent from instead, the same way createSuggestion
// does. Keys are short so they survive in a URL; the host page owns the copy.
export async function createIntroduction(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");

  const back = introReturnPath(formData.get("returnTo"));
  const reject = (code: string) => redirect(`${back}?intro=${code}`);

  const aId = String(formData.get("personAId") || "");
  const bId = String(formData.get("personBId") || "");
  // The one line the matchmaker writes, and it is about the PAIRING ("you're
  // both climbers who just moved to Brooklyn"), never a description of either
  // person. Each member is presented in their own profile words.
  const blurb = String(formData.get("blurb") || "").trim().slice(0, 1000) || null;
  if (!aId || !bId) return reject("pick-two");
  if (aId === bId) return reject("same-person");

  const [a, b] = await Promise.all([
    prisma.person.findUnique({ where: { id: aId }, select: { id: true, name: true, phone: true, email: true, instagram: true, smsConsentAt: true, openToMatch: true, status: true } }),
    prisma.person.findUnique({ where: { id: bId }, select: { id: true, name: true, phone: true, email: true, instagram: true, smsConsentAt: true, openToMatch: true, status: true } }),
  ]);
  if (!a || !b) return reject("missing-person");
  // An operator explicitly introducing two people IS the readiness decision, so
  // this does not require the member-app `openToMatch` opt-in: that flag is a
  // member's self-serve pause switch, and gating operator intros on it left every
  // approved-but-not-yet-opted-in member unmatchable. The real consent point is
  // unchanged - each person still has to answer Y to the double opt-in email
  // before anyone is connected. We only require an active roster member here.
  if (a.status !== "active" || b.status !== "active") {
    return reject("not-approved");
  }
  // Email is the baseline opt-in channel (double opt-in link + Y/N reply); SMS is
  // sent only with separate SMS consent. Require one authorized channel each.
  if ((!a.email && !(a.phone && a.smsConsentAt)) || (!b.email && !(b.phone && b.smsConsentAt))) {
    return reject("no-channel");
  }

  const existing = await prisma.match.findFirst({
    where: { OR: [{ personAId: aId, personBId: bId }, { personAId: bId, personBId: aId }] },
  });
  // Only a LIVE invitation blocks a new one: someone is holding an unanswered
  // email and re-sending would rotate their token out from under them. A
  // `suggested` row is the stage before an introduction (the pipeline reads
  // suggested -> invited -> mutual_yes -> connected) and emailed nobody, so it
  // gets promoted here rather than refusing forever. Treating it as "open" made
  // every pair the Status board or the co-pilot had ever suggested permanently
  // un-introducible, and said so with a crash page.
  if (existing && LIVE_INTRO_STAGES.includes(existing.stage)) {
    return reject("already-open");
  }
  const blocked = await prisma.block.findFirst({
    where: { OR: [{ blockerId: aId, blockedId: bId }, { blockerId: bId, blockedId: aId }] },
  });
  if (blocked) return reject("blocked");

  // Reuse the existing row when re-introducing a pair that previously closed or
  // connected: the (personAId, personBId) unique constraint means a blind create
  // would crash (P2002) or, in reverse order, create a duplicate the webhook
  // would then attach replies to nondeterministically. Reset it to a fresh invite.
  const intro = await prisma.$transaction(async (tx) => {
    let row: { id: string; personAId: string };
    if (existing) {
      await tx.deliveryJob.deleteMany({ where: { matchId: existing.id } });
      row = await tx.match.update({
        where: { id: existing.id },
        data: {
          createdById: op.id,
          stage: "invited",
          aDecision: "pending",
          bDecision: "pending",
          connectedAt: null,
          conversationSid: null,
          exitReason: null,
          lastActorId: null,
          rationale: blurb,
          notifiedAAt: null,
          notifiedBAt: null,
        },
        select: { id: true, personAId: true },
      });
    } else {
      row = await tx.match.create({
        data: {
          personAId: aId,
          personBId: bId,
          createdById: op.id,
          stage: "invited",
          rationale: blurb,
        },
        select: { id: true, personAId: true },
      });
    }

    // One call queues both channels: the email carrying each person's own
    // profile, and, for anyone who consented to texts, a nudge to the same page.
    await sendEmailInvites(row.id, { db: tx, throwOnError: true });
    return row;
  });

  await Promise.all([
    logIntroMessage({ matchId: intro.id, body: `Queued an invite for ${a.name.split(" ")[0]} to meet ${b.name.split(" ")[0]}.`, author: "bot", kind: "invite" }),
    logIntroMessage({ matchId: intro.id, body: `Queued an invite for ${b.name.split(" ")[0]} to meet ${a.name.split(" ")[0]}.`, author: "bot", kind: "invite" }),
  ]);
  revalidatePath("/studio");
  revalidatePath("/studio/matchmaking");
  revalidatePath("/studio/conversations");
  revalidatePath("/studio/matches");
  revalidatePath("/studio/delivery");
  // The intro can be started from either person's profile, so refresh both.
  revalidatePath(`/studio/person/${aId}`);
  revalidatePath(`/studio/person/${bId}`);
  // Sending was the only outcome with no feedback at all: the form cleared and
  // the operator had to open Delivery to learn whether anything went out.
  redirect(`${back}?intro=sent`);
}

// Operator: re-send the invitation to whoever hasn't replied yet. Rotating the
// token supersedes the pending email and text for that side, and rebuilds both
// from the member's current profile rather than a stale copy.
export async function resendIntro(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const matchId = String(formData.get("matchId") || "");
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { id: true } });
  if (!match) throw new Error("No such introduction.");

  await sendEmailInvites(matchId);
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
  if (!token || (raw !== "yes" && raw !== "pass")) {
    redirect(`/i/${encodeURIComponent(token)}?d=bad-request`);
  }

  const outcome = await recordInviteDecision(token, raw as "yes" | "pass");
  revalidatePath(`/i/${token}`);

  // Say what happened. This used to return silently on every refusal, so a
  // member whose token had expired, whose introduction had since closed, or who
  // had already answered from the email tapped Yes and watched the page come
  // back with the same two buttons. Nothing errored and nothing was recorded,
  // which reads as the button being broken. Same reasoning as the `?intro=`
  // codes on the operator side: a refusal has to explain itself where it
  // happened.
  const code = outcome.ok
    ? outcome.connected
      ? "connected"
      : outcome.nowMutual
        ? "mutual"
        : raw === "yes"
          ? "yes"
          : "pass"
    : "stale";
  redirect(`/i/${encodeURIComponent(token)}?d=${code}`);
}

// Operator: close an introduction (either side passed, or it fizzled).
export async function closeIntroduction(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const matchId = String(formData.get("matchId") || "");
  await prisma.$transaction([
    prisma.match.update({
      where: { id: matchId },
      data: { stage: "exit", exitReason: "operator_closed" },
    }),
    prisma.deliveryJob.updateMany({
      where: {
        matchId,
        status: { in: ["pending", "processing", "failed"] },
      },
      data: {
        status: "cancelled",
        lockedAt: null,
        leaseToken: null,
        lastError: "Cancelled because the introduction was closed.",
      },
    }),
  ]);
  revalidatePath("/studio/matchmaking");
  revalidatePath("/studio/conversations");
  revalidatePath(`/studio/conversations/${matchId}`);
}

// Operator bulk action: resend the invitation to every stalled introduction (no
// reply for STALLED_DAYS+), contacting only the side(s) still pending. Capped so
// one click can't fan out an unbounded number of sends.
export async function bulkResendStalled() {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");

  const stalled = await prisma.match.findMany({
    where: stalledWhere(),
    select: { id: true },
    orderBy: { notifiedAAt: "asc" },
    take: 50,
  });

  let resent = 0;
  for (const match of stalled) {
    const queued = await sendEmailInvites(match.id);
    if (queued > 0) {
      await logIntroMessage({ matchId: match.id, body: "Queued another intro invitation for each person still waiting to decide.", author: "operator", kind: "operator" });
      resent += 1;
    }
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

  const matches = await prisma.match.findMany({
    where: expiredWhere(),
    select: { id: true },
  });
  const matchIds = matches.map((match) => match.id);
  const [, res] = await prisma.$transaction([
    prisma.deliveryJob.updateMany({
      where: {
        matchId: { in: matchIds },
        status: { in: ["pending", "processing", "failed"] },
      },
      data: {
        status: "cancelled",
        lockedAt: null,
        leaseToken: null,
        lastError: "Cancelled because the introduction expired.",
      },
    }),
    prisma.match.updateMany({
      where: { id: { in: matchIds } },
      data: { stage: "exit", exitReason: "expired" },
    }),
  ]);

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
      personA: { select: { name: true, email: true, phone: true, smsConsentAt: true } },
      personB: { select: { name: true, email: true, phone: true, smsConsentAt: true } },
    },
  });
  if (!match) throw new Error("No such introduction.");

  const jobs: Promise<unknown>[] = [];
  const window = deliveryWindow();
  const sides = [
    { me: match.personA, other: match.personB, id: match.personAId },
    { me: match.personB, other: match.personA, id: match.personBId },
  ];
  for (const { me, other, id } of sides) {
    // Email is the baseline "how was your date?" channel; SMS only with consent.
    if (me.email) {
      const msg = matchFeedbackEmail({ toName: me.name, otherName: other.name });
      jobs.push(queueEmailDelivery({
        kind: "match_feedback_email",
        to: me.email,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        idempotencyKey: makeDeliveryKey("feedback-email", matchId, id, window),
        matchId,
        personId: id,
      }));
    }
    if (me.phone && me.smsConsentAt) {
      jobs.push(queueSmsDelivery({
        kind: "feedback_request",
        to: me.phone,
        body: feedbackRequestSMS({ toName: me.name, otherName: other.name, operatorName: op.name }),
        template: feedbackRequestTemplate({
          toName: me.name,
          otherName: other.name,
          operatorName: op.name,
          // Prelude cannot receive a reply, so the text has to point somewhere.
          // The member app is the one page every member can already reach.
          feedbackUrl: `${(process.env.NEXT_PUBLIC_APP_URL || "https://hellomutuals.com").replace(/\/$/, "")}/app`,
        }),
        idempotencyKey: makeDeliveryKey("feedback", matchId, id, window),
        matchId,
        personId: id,
      }));
    }
  }
  await Promise.all(jobs);
  await prisma.match.update({
    where: { id: matchId },
    data: { followUpAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
  });
  revalidatePath("/studio/matchmaking");
  revalidatePath(`/studio/conversations/${matchId}`);
}

// Operator: nudge a connected pair to actually meet ("reminder to meet"). Emails
// each side (baseline) and texts anyone who consented to SMS. Idempotent within a
// 5-minute window so a double click does not double-send.
export async function remindToMeet(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const matchId = String(formData.get("matchId") || "");
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      personA: { select: { name: true, email: true, phone: true, smsConsentAt: true, city: true } },
      personB: { select: { name: true, email: true, phone: true, smsConsentAt: true, city: true } },
    },
  });
  if (!match) throw new Error("No such introduction.");

  const city = match.personA.city || match.personB.city || null;
  const window = deliveryWindow();
  const jobs: Promise<unknown>[] = [];
  const sides = [
    { me: match.personA, other: match.personB, id: match.personAId },
    { me: match.personB, other: match.personA, id: match.personBId },
  ];
  for (const { me, other, id } of sides) {
    if (me.email) {
      const msg = matchReminderEmail({ toName: me.name, otherName: other.name, city });
      jobs.push(queueEmailDelivery({
        kind: "match_reminder_email",
        to: me.email,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        idempotencyKey: makeDeliveryKey("meet-reminder-email", matchId, id, window),
        matchId,
        personId: id,
      }));
    }
    if (me.phone && me.smsConsentAt) {
      jobs.push(queueSmsDelivery({
        kind: "meet_reminder_sms",
        to: me.phone,
        body: `Hi ${me.name.split(" ")[0]}, a nudge from Mutuals: you and ${other.name.split(" ")[0]} both said yes. Reply to your intro thread and find a time this week.`,
        idempotencyKey: makeDeliveryKey("meet-reminder-sms", matchId, id, window),
        matchId,
        personId: id,
      }));
    }
  }
  if (jobs.length === 0) throw new Error("Neither person has an email or text channel on file.");
  await Promise.all(jobs);
  await logIntroMessage({ matchId, body: "Sent a reminder to meet to both people.", author: "operator", kind: "operator" });
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

  const nonce = newDeliveryNonce();
  let queued = false;
  if (match.conversationSid && match.personA.smsConsentAt && match.personB.smsConsentAt) {
    await queueConversationDelivery({
      kind: "operator_group_message",
      conversationSid: match.conversationSid,
      body: message,
      idempotencyKey: makeDeliveryKey("operator-group", matchId, nonce),
      matchId,
    });
    queued = true;
  }
  if (!queued) {
    // No live group thread (or send failed): text each side directly.
    const jobs: Promise<unknown>[] = [];
    if (match.personA.phone && match.personA.smsConsentAt) {
      jobs.push(queueSmsDelivery({
        kind: "operator_group_message",
        to: match.personA.phone,
        body: message,
        idempotencyKey: makeDeliveryKey("operator-group", matchId, match.personAId, nonce),
        matchId,
        personId: match.personAId,
      }));
    }
    if (match.personB.phone && match.personB.smsConsentAt) {
      jobs.push(queueSmsDelivery({
        kind: "operator_group_message",
        to: match.personB.phone,
        body: message,
        idempotencyKey: makeDeliveryKey("operator-group", matchId, match.personBId, nonce),
        matchId,
        personId: match.personBId,
      }));
    }
    if (jobs.length === 0) throw new Error("Neither person has an authorized text channel.");
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
  await queueSmsDelivery({
    kind: "operator_direct_message",
    to: person.phone,
    body: message,
    idempotencyKey: makeDeliveryKey("operator-direct", op.id, personId, newDeliveryNonce()),
    personId,
  });
  // Log it so the thread is auditable from the person's record.
  await prisma.note.create({ data: { subjectId: personId, authorId: op.id, body: `[SMS queued] ${message}`, kind: "general" } });
  revalidatePath("/studio/matchmaking");
}

// --- public intake: dinner seat + coaching requests -------------------------
//
// Lightweight lead capture from the public marketing pages. Both notify the
// operator inbox and send the requester a confirmation, so a "Request a seat" or
// "Apply for coaching" click is a real, acknowledged action rather than a link to
// the generic apply form. Signed-in members also get their interest recorded on
// the dinner guest list.

function operatorInbox(): string {
  return process.env.OPERATOR_INBOX || process.env.RESEND_REPLY_TO || "josh@shiftsupportnetwork.com";
}

// Coarse time bucket used in intake idempotency keys. Double-submitting the same
// form collapses into one queued email, while a genuine later request from the
// same person still gets through.
function requestBucket(): string {
  return String(Math.floor(Date.now() / (15 * 60 * 1000)));
}

async function clientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  return (
    h.get("fly-client-ip") ||
    (xff ? xff.split(",").map((s) => s.trim()).filter(Boolean).at(-1) : "") ||
    h.get("x-real-ip") ||
    "anon"
  ).trim();
}

export async function requestDinnerSeat(formData: FormData) {
  const dinnerId = String(formData.get("dinnerId") || "");
  const note = String(formData.get("note") || "").trim().slice(0, 600);
  const me = await getCurrentPerson();

  const ip = await clientIp();
  // A throttled request is discarded, so it must not render the success state.
  // This used to redirect to `requested=1`, which told someone "Request
  // received. A matchmaker will follow up personally" for a lead that was
  // never recorded. Shared office and campus NAT means a real guest can hit
  // this cap without doing anything wrong.
  if (!(await rateLimit(`dinnerreq:ip:${ip}`, 15, 60 * 60 * 1000)).ok) {
    redirect("/dinners?error=throttled");
  }

  const name = (me?.name || String(formData.get("name") || "")).trim().slice(0, 80);
  const email = normalizeEmail(me?.email || String(formData.get("email") || ""));
  if (!name || !email.includes("@")) redirect("/dinners?error=missing");

  const dinner = dinnerId ? await prisma.dinner.findUnique({ where: { id: dinnerId } }) : null;
  const context = dinner
    ? `${dinner.theme || "Mutuals Dinner"} - ${dinner.city}, ${formatEventDay(dinner.date, dinner.city, { month: "long", day: "numeric" })}`
    : "an upcoming Mutuals dinner";

  // Signed-in member: record their interest on the guest list so it surfaces in
  // the operator's event view. The operator still confirms the actual seat.
  if (me && dinner) {
    await prisma.dinnerAttendee.upsert({
      where: { dinnerId_personId: { dinnerId: dinner.id, personId: me.id } },
      create: { dinnerId: dinner.id, personId: me.id, status: "invited" },
      update: {},
    });
  }

  // Queue through the delivery outbox rather than sending inline. A direct send
  // that fails would lose the lead outright: the requester is told a matchmaker
  // will follow up, but nothing is recorded anywhere. Queued jobs retry and
  // surface to operators when they end up failing.
  const bucket = requestBucket();
  const lead = operatorLeadEmail({ kind: "dinner", name, email, detail: note, context });
  const ack = requestReceivedEmail({ name, kind: "dinner", context });
  try {
    await queueEmailDelivery({
      kind: "dinner_request_lead",
      to: operatorInbox(),
      subject: lead.subject,
      html: lead.html,
      text: lead.text,
      replyTo: email,
      idempotencyKey: makeDeliveryKey("dinner_lead", dinner?.id || "none", email, bucket),
    });
    await queueEmailDelivery({
      kind: "dinner_request_ack",
      to: email,
      subject: ack.subject,
      html: ack.html,
      text: ack.text,
      idempotencyKey: makeDeliveryKey("dinner_ack", dinner?.id || "none", email, bucket),
    });
  } catch (error) {
    console.error(`[dinner-request] could not queue request: ${(error as Error).message}`);
    redirect("/dinners?error=send");
  }

  revalidatePath("/dinners");
  redirect("/dinners?requested=1");
}

export async function requestCoaching(formData: FormData) {
  const me = await getCurrentPerson();
  const typeRaw = String(formData.get("type") || "dating");
  const type = typeRaw === "couples" ? "couples" : "dating";
  const note = String(formData.get("note") || "").trim().slice(0, 600);

  const ip = await clientIp();
  // Same as the dinner request above: throttled means discarded, so it cannot
  // render the success state.
  if (!(await rateLimit(`coachreq:ip:${ip}`, 15, 60 * 60 * 1000)).ok) {
    redirect("/coaching?error=throttled");
  }

  const name = (me?.name || String(formData.get("name") || "")).trim().slice(0, 80);
  const email = normalizeEmail(me?.email || String(formData.get("email") || ""));
  if (!name || !email.includes("@")) redirect("/coaching?error=missing");

  const context = type === "couples" ? "Couples coaching" : "Dating coaching";
  // Queued for the same reason as the dinner request above: a failed inline send
  // would silently drop the lead after telling the requester we had it.
  const bucket = requestBucket();
  const lead = operatorLeadEmail({ kind: "coaching", name, email, detail: note, context });
  const ack = requestReceivedEmail({ name, kind: "coaching", context });
  try {
    await queueEmailDelivery({
      kind: "coaching_request_lead",
      to: operatorInbox(),
      subject: lead.subject,
      html: lead.html,
      text: lead.text,
      replyTo: email,
      idempotencyKey: makeDeliveryKey("coaching_lead", type, email, bucket),
    });
    await queueEmailDelivery({
      kind: "coaching_request_ack",
      to: email,
      subject: ack.subject,
      html: ack.html,
      text: ack.text,
      idempotencyKey: makeDeliveryKey("coaching_ack", type, email, bucket),
    });
  } catch (error) {
    console.error(`[coaching-request] could not queue request: ${(error as Error).message}`);
    redirect("/coaching?error=send");
  }
  redirect("/coaching?requested=1");
}
