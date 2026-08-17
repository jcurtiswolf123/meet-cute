import { createHash, randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import type { DeliveryJob, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { connectionEmail, matchThreadEmail, sendEmail, unfinishedApplicationEmail } from "./email";
import { dateIdeasFor } from "./date-ideas";
import { REMINDER_SCHEDULE_MS } from "./recommendations";
import { datePickToken, datePickUrl } from "./date-pick";
import {
  PRELUDE_TEMPLATES,
  normalizePhone,
  sendConversationMessage,
  sendSMS,
  type PreludeTemplate,
  type SmsTemplate,
} from "./sms";

const STALE_LOCK_MS = 2 * 60_000;
const BUSY_WORKER_INTERVAL_MS = 5_000;
const IDLE_WORKER_INTERVAL_MS = 30_000;
const CLEANUP_INTERVAL_MS = 60 * 60_000;
const DEFAULT_BATCH_SIZE = 20;

export type DeliveryChannel = "email" | "sms" | "conversation";

export type DeliverySendResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; retryable: boolean; error: string };

export type EnqueueDeliveryInput = {
  channel: DeliveryChannel;
  kind: string;
  recipient: string;
  payload: Prisma.InputJsonValue;
  idempotencyKey: string;
  matchId?: string | null;
  personId?: string | null;
  inviteId?: string | null;
  maxAttempts?: number;
  availableAt?: Date;
};

type DeliveryDb = typeof prisma | Prisma.TransactionClient;
type DeliverySender = (job: DeliveryJob) => Promise<DeliverySendResult>;

type DeliveryEligibility =
  | { ok: true }
  | { ok: false; reason: string };

export function makeDeliveryKey(...parts: string[]): string {
  const label = (parts[0] || "delivery").replace(/[^a-z0-9_-]/gi, "").slice(0, 48) || "delivery";
  const digest = createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 40);
  return `${label}:${digest}`;
}

export function retryDelayMs(attempt: number): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  return Math.min(30_000 * 2 ** (safeAttempt - 1), 3_600_000);
}

export async function enqueueDelivery(
  input: EnqueueDeliveryInput,
  db: DeliveryDb = prisma,
): Promise<DeliveryJob> {
  const client = db as typeof prisma;
  await client.deliveryJob.createMany({
    data: {
      channel: input.channel,
      kind: input.kind,
      recipient: input.recipient,
      payload: input.payload,
      idempotencyKey: input.idempotencyKey,
      matchId: input.matchId ?? null,
      personId: input.personId ?? null,
      inviteId: input.inviteId ?? null,
      maxAttempts: Math.max(1, Math.min(input.maxAttempts ?? 6, 12)),
      availableAt: input.availableAt ?? new Date(),
    },
    skipDuplicates: true,
  });
  return client.deliveryJob.findUniqueOrThrow({
    where: { idempotencyKey: input.idempotencyKey },
  });
}

export async function queueEmailDelivery(args: {
  kind: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  idempotencyKey: string;
  matchId?: string | null;
  personId?: string | null;
  inviteId?: string | null;
  inviteToken?: string | null;
  /** Send no earlier than this. Used by the scheduled nudge and follow-up,
   *  which ride the outbox rather than a cron. */
  availableAt?: Date;
  db?: Prisma.TransactionClient;
}): Promise<DeliveryJob> {
  const to = Array.isArray(args.to) ? args.to : [args.to];
  return enqueueDelivery(
    {
      channel: "email",
      kind: args.kind,
      recipient: to.join(","),
      payload: {
        to,
        subject: args.subject,
        html: args.html,
        ...(args.text ? { text: args.text } : {}),
        ...(args.replyTo ? { replyTo: args.replyTo } : {}),
        ...(args.headers ? { headers: args.headers } : {}),
        ...(args.inviteToken ? { inviteToken: args.inviteToken } : {}),
      },
      idempotencyKey: args.idempotencyKey,
      matchId: args.matchId,
      personId: args.personId,
      inviteId: args.inviteId,
      ...(args.availableAt ? { availableAt: args.availableAt } : {}),
    },
    args.db,
  );
}

/**
 * Withdraw scheduled mail that no longer needs to go out.
 *
 * The nudges and the recommender follow-up are queued into the future the
 * moment they become possible, using this outbox's own `availableAt`. That is
 * why there is no cron: the scheduler already exists. The cost is that they
 * have to be withdrawn once the thing they were going to ask about has
 * happened, and a nudge that reaches someone who already answered is the
 * fastest way to teach recommenders to ignore this mail.
 */
export async function cancelScheduledMail(kind: string, recipient: string): Promise<number> {
  const cancelled = await prisma.deliveryJob.updateMany({
    where: { kind, recipient, status: "pending" },
    data: {
      status: "cancelled",
      lockedAt: null,
      leaseToken: null,
      lastError: "Cancelled because it was no longer needed.",
    },
  });
  return cancelled.count;
}

/**
 * Withdraw scheduled mail by the exact jobs it is, not by who it is addressed to.
 *
 * `cancelScheduledMail` keys on kind plus recipient, which is correct for mail
 * that is about the recipient themselves (an unused sign-in link, an unfinished
 * application: one person, one address, one thing outstanding). It is wrong for
 * mail that is about somebody else. A friend named by five applicants has one
 * address and five separate asks, so answering for one of them withdrew the
 * nudges for the other four, unsent, and those four applicants were left waiting
 * on a friend who was never chased again. Twelve production nudges went that way
 * before this existed.
 */
export async function cancelScheduledMailByKeys(keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  const cancelled = await prisma.deliveryJob.updateMany({
    where: { idempotencyKey: { in: keys }, status: "pending" },
    data: {
      status: "cancelled",
      lockedAt: null,
      leaseToken: null,
      lastError: "Cancelled because it was no longer needed.",
    },
  });
  return cancelled.count;
}

/**
 * The keys of the three nudges queued alongside one recommendation request.
 *
 * They are derived, not stored, so this is the only place that has to agree with
 * the enqueue in `actions.ts`. A nudge added to `REMINDER_SCHEDULE_MS` is
 * withdrawn by that agreement rather than by remembering to update a second list.
 */
export function recommendationReminderKeys(token: string): string[] {
  return REMINDER_SCHEDULE_MS.map((_, index) =>
    makeDeliveryKey("recommendation_reminder", token, `auto${index}`),
  );
}

/** Withdraw the nudges for one friend's ask, and nobody else's. */
export async function cancelRecommendationReminders(token: string): Promise<number> {
  return cancelScheduledMailByKeys(recommendationReminderKeys(token));
}

/**
 * Withdraw every outstanding nudge for an applicant, whoever it was going to.
 *
 * Answering withdraws one friend's nudges; being accepted withdraws the lot,
 * because the question they were asking has been settled by then. Acceptance can
 * arrive by a route that never touches a recommendation at all (an operator
 * approving early, a nomination that carried words), and until this existed
 * those routes left the nudges queued: a member accepted on 2026-08-11 still had
 * two chase emails scheduled for friends of hers a week later.
 */
export async function cancelRemindersForApplicant(applicantId: string): Promise<number> {
  const requests = await prisma.recommendation.findMany({
    where: { applicantId },
    select: { token: true },
  });
  return cancelScheduledMailByKeys(requests.flatMap((request) => recommendationReminderKeys(request.token)));
}

export async function queueSmsDelivery(args: {
  kind: string;
  to: string;
  body: string;
  // Prelude sends registered templates rather than free text, so the template
  // rides in the payload next to the body. Twilio and Telnyx ignore it.
  template?: SmsTemplate;
  idempotencyKey: string;
  matchId?: string | null;
  personId?: string | null;
  // Set for intro nudges so a re-sent invitation supersedes the pending text the
  // same way it supersedes the pending email.
  inviteId?: string | null;
  db?: Prisma.TransactionClient;
}): Promise<DeliveryJob> {
  return enqueueDelivery(
    {
      channel: "sms",
      kind: args.kind,
      recipient: args.to,
      payload: {
        to: args.to,
        body: args.body,
        ...(args.template ? { template: args.template } : {}),
      },
      idempotencyKey: args.idempotencyKey,
      matchId: args.matchId,
      personId: args.personId,
      inviteId: args.inviteId,
    },
    args.db,
  );
}

export async function queueConversationDelivery(args: {
  kind: string;
  conversationSid: string;
  body: string;
  idempotencyKey: string;
  matchId?: string | null;
}): Promise<DeliveryJob> {
  return enqueueDelivery({
    channel: "conversation",
    kind: args.kind,
    recipient: args.conversationSid,
    payload: { conversationSid: args.conversationSid, body: args.body },
    idempotencyKey: args.idempotencyKey,
    matchId: args.matchId,
  });
}

function payloadObject(job: DeliveryJob): Record<string, unknown> {
  if (!job.payload || typeof job.payload !== "object" || Array.isArray(job.payload)) {
    throw new Error("delivery payload is not an object");
  }
  return job.payload as Record<string, unknown>;
}

function stringField(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value) throw new Error(`delivery payload is missing ${key}`);
  return value;
}

/** Read the optional Prelude template back out of a stored payload. Jobs queued
 *  before the Prelude wiring, and every job queued for Twilio or Telnyx, simply
 *  have no template. Anything malformed is dropped rather than trusted, so a bad
 *  row cannot make sendSMS send the wrong template. */
function smsTemplateField(payload: Record<string, unknown>): SmsTemplate | undefined {
  const raw = payload.template;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const { name, variables } = raw as { name?: unknown; variables?: unknown };
  if (typeof name !== "string") return undefined;
  if (!PRELUDE_TEMPLATES.includes(name as PreludeTemplate)) return undefined;
  if (!variables || typeof variables !== "object" || Array.isArray(variables)) return undefined;
  const entries = Object.entries(variables as Record<string, unknown>);
  if (!entries.every(([, v]) => typeof v === "string")) return undefined;
  return {
    name: name as PreludeTemplate,
    variables: Object.fromEntries(entries) as Record<string, string>,
  };
}

/**
 * Re-render an email whose contents went out of date while it sat in the queue.
 *
 * The unfinished-application chaser is queued the moment somebody signs in and
 * sent a day later, and it is rendered at the point it is queued. So it is
 * written for a person who has just arrived and done nothing, and it is sent to
 * a person who has had a day to do something. Anyone who fills in the details
 * within that day, which is the ordinary path, gets an email that tells them
 * they never started, points them at the beginning of the form, and never
 * mentions the photos they uploaded.
 *
 * That was not one bad send. On 4 August four people were queued to be told
 * they had not finished when they had already saved everything and uploaded 12
 * photos between them: each one screen from being a member, each about to be
 * sent back to the start.
 *
 * Rendering here instead is the fix, and keying it off the kind rather than a
 * flag in the payload means the jobs already sitting in the queue are corrected
 * too, without touching a single stored row.
 *
 * Returns null when there is nothing to re-render, and the stored payload is
 * used as it was.
 */
export async function freshenEmailPayload(
  job: DeliveryJob,
): Promise<{ subject: string; html: string; text: string } | null> {
  if (job.kind !== "application_unfinished" || !job.personId) return null;

  const person = await prisma.person.findUnique({
    where: { id: job.personId },
    select: { name: true, appliedAt: true, basicsAt: true },
  });
  // Submitting withdraws this job, so reaching here having applied means the
  // withdrawal was missed. Say nothing rather than chase a member for an
  // application they have already handed in.
  if (!person || person.appliedAt) return null;

  const photos = await prisma.photo.count({
    where: { personId: job.personId, status: "approved" },
  });
  const basicsSaved = !!person.basicsAt;
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://hellomutuals.com").replace(/\/$/, "");
  const msg = unfinishedApplicationEmail({
    name: person.name,
    photos,
    basicsSaved,
    // Land them on the half they actually stopped at, which is also a thing
    // that can have changed since this was queued.
    applyUrl: `${base}${basicsSaved ? "/apply/friends" : "/apply"}`,
  });
  return { subject: msg.subject, html: msg.html, text: msg.text };
}

async function sendDeliveryJob(job: DeliveryJob): Promise<DeliverySendResult> {
  const payload = payloadObject(job);
  if (job.channel === "email") {
    const rawTo = payload.to;
    const to =
      typeof rawTo === "string"
        ? rawTo
        : Array.isArray(rawTo) && rawTo.every((value) => typeof value === "string")
          ? rawTo
          : null;
    if (!to) throw new Error("delivery payload is missing to");
    const headers =
      payload.headers && typeof payload.headers === "object" && !Array.isArray(payload.headers)
        ? (payload.headers as Record<string, string>)
        : undefined;
    // Anything queued well ahead of its send is rendered again here, so it
    // describes the person as they are now rather than as they were.
    const fresh = await freshenEmailPayload(job);
    return sendEmail({
      to,
      subject: fresh ? fresh.subject : stringField(payload, "subject"),
      html: fresh ? fresh.html : stringField(payload, "html"),
      text: fresh ? fresh.text : typeof payload.text === "string" ? payload.text : undefined,
      replyTo: typeof payload.replyTo === "string" ? payload.replyTo : undefined,
      headers,
      idempotencyKey: job.idempotencyKey,
    });
  }
  if (job.channel === "sms") {
    return sendSMS({
      to: stringField(payload, "to"),
      body: stringField(payload, "body"),
      template: smsTemplateField(payload),
    });
  }
  if (job.channel === "conversation") {
    const result = await sendConversationMessage({
      conversationSid: stringField(payload, "conversationSid"),
      body: stringField(payload, "body"),
    });
    return result.ok
      ? { ok: true }
      : { ok: false, retryable: false, error: result.reason || "conversation send failed" };
  }
  return { ok: false, retryable: false, error: `unsupported delivery channel ${job.channel}` };
}

async function claimNextDelivery(args: {
  now: Date;
  idempotencyPrefix?: string;
  matchId?: string;
}): Promise<DeliveryJob | null> {
  const prefixWhere = args.idempotencyPrefix
    ? { idempotencyKey: { startsWith: args.idempotencyPrefix } }
    : {};
  const staleBefore = new Date(args.now.getTime() - STALE_LOCK_MS);
  // Email requests carry a stable provider idempotency key, so an interrupted
  // claim can be retried safely. SMS and Conversations do not provide an
  // equivalent guarantee. Leave an ambiguous non-email send failed for an
  // operator to inspect instead of risking a duplicate text.
  await prisma.deliveryJob.updateMany({
    where: {
      status: "processing",
      lockedAt: { lt: staleBefore },
      channel: "email",
      ...prefixWhere,
      ...(args.matchId ? { matchId: args.matchId } : {}),
    },
    data: {
      status: "pending",
      lockedAt: null,
      leaseToken: null,
      availableAt: args.now,
      lastError: "Recovered after an interrupted worker.",
    },
  });
  await prisma.deliveryJob.updateMany({
    where: {
      status: "processing",
      lockedAt: { lt: staleBefore },
      channel: { in: ["sms", "conversation"] },
      ...prefixWhere,
      ...(args.matchId ? { matchId: args.matchId } : {}),
    },
    data: {
      status: "failed",
      lockedAt: null,
      leaseToken: null,
      lastError:
        "The provider outcome is unknown after an interrupted worker. Review before retrying.",
    },
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = await prisma.deliveryJob.findFirst({
      where: {
        status: "pending",
        availableAt: { lte: args.now },
        ...prefixWhere,
        ...(args.matchId ? { matchId: args.matchId } : {}),
      },
      orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
    });
    if (!candidate) return null;
    const leaseToken = randomUUID();
    const claimed = await prisma.deliveryJob.updateMany({
      where: {
        id: candidate.id,
        status: "pending",
        availableAt: { lte: args.now },
      },
      data: {
        status: "processing",
        lockedAt: args.now,
        leaseToken,
        attempts: { increment: 1 },
      },
    });
    if (claimed.count === 1) {
      return prisma.deliveryJob.findUnique({ where: { id: candidate.id } });
    }
  }
  return null;
}

async function finalizeConnectionIfReady(matchId: string): Promise<void> {
  const matchState = await prisma.match.findUnique({
    where: { id: matchId },
    select: { personAId: true, personBId: true, stage: true },
  });
  if (!matchState || matchState.stage !== "connecting") return;
  const successfulDeliveries = await prisma.deliveryJob.findMany({
    where: {
      matchId,
      kind: { startsWith: "connection_" },
      status: "sent",
    },
    select: { kind: true, personId: true },
  });
  const delivered = new Set<string>();
  for (const job of successfulDeliveries) {
    if (job.kind === "connection_email_thread") {
      delivered.add(matchState.personAId);
      delivered.add(matchState.personBId);
    } else if (job.personId) {
      delivered.add(job.personId);
    }
  }
  if (!delivered.has(matchState.personAId) || !delivered.has(matchState.personBId)) return;

  const connected = await prisma.match.updateMany({
    where: {
      id: matchId,
      stage: "connecting",
      aDecision: "yes",
      bDecision: "yes",
    },
    data: {
      stage: "connected",
      connectedAt: new Date(),
      conversationSid: null,
    },
  });
  if (connected.count !== 1) return;

  await prisma.deliveryJob.updateMany({
    where: {
      matchId,
      kind: { startsWith: "connection_" },
      status: { in: ["pending", "processing", "failed"] },
    },
    data: {
      status: "cancelled",
      lockedAt: null,
      leaseToken: null,
      lastError: "Cancelled because both members already received the connection.",
    },
  });

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { personA: { select: { name: true } }, personB: { select: { name: true } } },
  });
  if (!match) return;
  await prisma.introMessage.create({
    data: {
      matchId,
      body: `Connected ${match.personA.name.split(" ")[0]} and ${match.personB.name.split(" ")[0]} through their authorized contact channels.`,
      direction: "out",
      author: "bot",
      kind: "system",
    },
  });
}

async function ownsDeliveryLease(job: DeliveryJob): Promise<boolean> {
  if (!job.leaseToken) return false;
  return (
    (await prisma.deliveryJob.count({
      where: {
        id: job.id,
        status: "processing",
        leaseToken: job.leaseToken,
      },
    })) === 1
  );
}

function normalizedEmail(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

async function deliveryEligibility(job: DeliveryJob): Promise<DeliveryEligibility> {
  const payload = payloadObject(job);
  if (job.personId) {
    const person = await prisma.person.findUnique({
      where: { id: job.personId },
      select: { email: true, phone: true, smsConsentAt: true },
    });
    if (!person) return { ok: false, reason: "The recipient account no longer exists." };
    if (job.channel === "sms") {
      if (!person.smsConsentAt) {
        return { ok: false, reason: "The recipient no longer consents to text messages." };
      }
      if (normalizePhone(person.phone) !== normalizePhone(job.recipient)) {
        return { ok: false, reason: "The recipient phone number changed after this was queued." };
      }
    }
    if (job.channel === "email") {
      const recipients = Array.isArray(payload.to)
        ? payload.to.filter((value): value is string => typeof value === "string")
        : typeof payload.to === "string"
          ? [payload.to]
          : [];
      if (!recipients.map(normalizedEmail).includes(normalizedEmail(person.email))) {
        return { ok: false, reason: "The recipient email changed after this was queued." };
      }
    }
  }

  if (job.inviteId && typeof payload.inviteToken === "string") {
    const invite = await prisma.matchInvite.findUnique({
      where: { id: job.inviteId },
      select: { token: true },
    });
    if (!invite || invite.token !== payload.inviteToken) {
      return { ok: false, reason: "This invitation was superseded by a newer token." };
    }
  }

  if (job.matchId) {
    const match = await prisma.match.findUnique({
      where: { id: job.matchId },
      select: {
        stage: true,
        personAId: true,
        personBId: true,
        aDecision: true,
        bDecision: true,
        personA: { select: { email: true, smsConsentAt: true } },
        personB: { select: { email: true, smsConsentAt: true } },
      },
    });
    if (!match) return { ok: false, reason: "The related introduction no longer exists." };
    if (job.kind.startsWith("intro_invite_")) {
      if (!["invited", "mutual_yes"].includes(match.stage)) {
        return { ok: false, reason: "The introduction is no longer awaiting a decision." };
      }
      const pending =
        job.personId === match.personAId
          ? match.aDecision === "pending"
          : job.personId === match.personBId
            ? match.bDecision === "pending"
            : false;
      if (!pending) return { ok: false, reason: "This recipient already decided." };
    } else if (job.kind.startsWith("connection_")) {
      if (
        match.stage !== "connecting" ||
        match.aDecision !== "yes" ||
        match.bDecision !== "yes"
      ) {
        return { ok: false, reason: "The connection is no longer authorized." };
      }
      const blocks = await prisma.block.count({
        where: {
          OR: [
            { blockerId: match.personAId, blockedId: match.personBId },
            { blockerId: match.personBId, blockedId: match.personAId },
          ],
        },
      });
      if (blocks > 0) return { ok: false, reason: "A block now exists between the members." };
      if (job.kind === "connection_email_thread") {
        const queuedRecipients = Array.isArray(payload.to)
          ? payload.to.filter((value): value is string => typeof value === "string")
          : [];
        const currentRecipients = [match.personA.email, match.personB.email].filter(
          (value): value is string => typeof value === "string",
        );
        const normalizedQueuedRecipients = queuedRecipients.map(normalizedEmail);
        if (
          queuedRecipients.length !== 2 ||
          currentRecipients.length !== 2 ||
          !currentRecipients.every((email) =>
            normalizedQueuedRecipients.includes(normalizedEmail(email)),
          )
        ) {
          return {
            ok: false,
            reason: "A participant email changed after the joint message was queued.",
          };
        }
      }
    } else if (match.stage === "exit") {
      return { ok: false, reason: "The related introduction is closed." };
    }
    if (
      job.channel === "conversation" &&
      (!match.personA.smsConsentAt || !match.personB.smsConsentAt)
    ) {
      return {
        ok: false,
        reason: "A participant no longer consents to text messages.",
      };
    }
  }
  return { ok: true };
}

async function recordCancelledDelivery(job: DeliveryJob, reason: string): Promise<boolean> {
  if (!job.leaseToken) return false;
  const cancelled = await prisma.deliveryJob.updateMany({
    where: { id: job.id, status: "processing", leaseToken: job.leaseToken },
    data: {
      status: "cancelled",
      lockedAt: null,
      leaseToken: null,
      lastError: reason.slice(0, 1000),
    },
  });
  return cancelled.count === 1;
}

async function recordSuccessfulDelivery(
  job: DeliveryJob,
  result: Extract<DeliverySendResult, { ok: true }>,
): Promise<boolean> {
  if (!job.leaseToken) return false;
  const payload = payloadObject(job);
  const sentAt = new Date();
  let recorded = false;
  await prisma.$transaction(async (tx) => {
    const updated = await tx.deliveryJob.updateMany({
      where: { id: job.id, status: "processing", leaseToken: job.leaseToken },
      data: {
        status: "sent",
        sentAt,
        lockedAt: null,
        leaseToken: null,
        lastError: null,
        providerMessageId: result.providerMessageId ?? null,
      },
    });
    if (updated.count !== 1) return;
    recorded = true;

    if (job.inviteId && typeof payload.inviteToken === "string") {
      await tx.matchInvite.updateMany({
        where: { id: job.inviteId, token: payload.inviteToken },
        data: { sentAt },
      });
    }
    if (job.matchId && job.kind.startsWith("intro_invite_a_")) {
      await tx.match.updateMany({
        where: { id: job.matchId, stage: { in: ["invited", "mutual_yes"] } },
        data: { notifiedAAt: sentAt },
      });
    }
    if (job.matchId && job.kind.startsWith("intro_invite_b_")) {
      await tx.match.updateMany({
        where: { id: job.matchId, stage: { in: ["invited", "mutual_yes"] } },
        data: { notifiedBAt: sentAt },
      });
    }
  });

  if (job.matchId && job.kind.startsWith("connection_")) {
    await finalizeConnectionIfReady(job.matchId);
  }
  return recorded;
}

async function recordFailedDelivery(
  job: DeliveryJob,
  result: Extract<DeliverySendResult, { ok: false }>,
): Promise<boolean> {
  if (!job.leaseToken) return false;
  const canRetry = result.retryable && job.attempts < job.maxAttempts;
  const updated = await prisma.deliveryJob.updateMany({
    where: { id: job.id, status: "processing", leaseToken: job.leaseToken },
    data: canRetry
      ? {
          status: "pending",
          availableAt: new Date(Date.now() + retryDelayMs(job.attempts)),
          lockedAt: null,
          leaseToken: null,
          lastError: result.error.slice(0, 1000),
        }
      : {
          status: "failed",
          lockedAt: null,
          leaseToken: null,
          lastError: result.error.slice(0, 1000),
        },
  });
  if (updated.count === 1 && !canRetry) {
    Sentry.captureMessage(
      `Delivery job ${job.id} failed permanently on ${job.channel}: ${result.error}`,
      "error",
    );
  }
  return updated.count === 1;
}

export async function drainDeliveryJobs(options: {
  limit?: number;
  send?: DeliverySender;
  idempotencyPrefix?: string;
  matchId?: string;
} = {}): Promise<{ processed: number; sent: number; failed: number }> {
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_BATCH_SIZE, 100));
  const sender = options.send ?? sendDeliveryJob;
  const summary = { processed: 0, sent: 0, failed: 0 };

  for (let index = 0; index < limit; index += 1) {
    const job = await claimNextDelivery({
      now: new Date(),
      idempotencyPrefix: options.idempotencyPrefix,
      matchId: options.matchId,
    });
    if (!job) break;
    summary.processed += 1;

    const eligibility = await deliveryEligibility(job);
    if (!eligibility.ok) {
      await recordCancelledDelivery(job, eligibility.reason);
      continue;
    }
    if (!(await ownsDeliveryLease(job))) continue;

    let result: DeliverySendResult;
    try {
      result = await sender(job);
    } catch (error) {
      result = {
        ok: false,
        retryable: true,
        error: error instanceof Error ? error.message : "delivery sender threw",
      };
    }

    if (result.ok) {
      if (await recordSuccessfulDelivery(job, result)) summary.sent += 1;
    } else {
      if (await recordFailedDelivery(job, result)) summary.failed += 1;
    }
  }
  return summary;
}

function connectionSms(args: {
  toName: string;
  otherName: string;
  otherEmail: string | null;
}): string {
  const contact = args.otherEmail;
  if (!contact) {
    return `Great news ${args.toName.split(" ")[0]}: ${args.otherName.split(" ")[0]} said yes too. Reply here and your matchmaker will help connect you.`;
  }
  return `Great news ${args.toName.split(" ")[0]}: ${args.otherName.split(" ")[0]} said yes too. You can reach them at ${contact}. Take it from here.`;
}

export async function queueConnectionDeliveries(matchId: string): Promise<number> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      personA: {
        select: {
          id: true, name: true, email: true, phone: true, city: true, smsConsentAt: true,
          // Read only for the date-ideas prompt, which sees profile text but
          // never puts it in the email: the model returns venue ids and one
          // line of reasoning, nothing quoted back at either member.
          neighborhood: true, bio: true, lookingFor: true,
        },
      },
      personB: {
        select: {
          id: true, name: true, email: true, phone: true, city: true, smsConsentAt: true,
          // Read only for the date-ideas prompt, which sees profile text but
          // never puts it in the email: the model returns venue ids and one
          // line of reasoning, nothing quoted back at either member.
          neighborhood: true, bio: true, lookingFor: true,
        },
      },
    },
  });
  if (!match || match.stage !== "connecting") return 0;

  const sides = [
    { side: "a", me: match.personA, other: match.personB },
    { side: "b", me: match.personB, other: match.personA },
  ] as const;
  const queued: Promise<DeliveryJob>[] = [];
  const bothHaveEmail = Boolean(match.personA.email && match.personB.email);

  // Where to go. Best effort and never awaited without a bound: dateIdeasFor
  // swallows its own failures and returns NO_IDEAS, so the connection email,
  // which is the payoff of the whole product, still goes out when the venue
  // table is empty or every model provider is down.
  const ideas = await dateIdeasFor({
    city: match.personA.city || match.personB.city,
    a: match.personA,
    b: match.personB,
  });
  const pickToken = datePickToken(matchId);
  const pickUrlFor = pickToken ? (venueId: string) => datePickUrl(pickToken, venueId) : undefined;

  if (match.personA.email && match.personB.email) {
    const message = matchThreadEmail({
      aName: match.personA.name,
      bName: match.personB.name,
      city: match.personA.city || match.personB.city,
      ideas,
      pickUrlFor,
    });
    queued.push(
      queueEmailDelivery({
        kind: "connection_email_thread",
        to: [match.personA.email, match.personB.email],
        subject: message.subject,
        html: message.html,
        text: message.text,
        idempotencyKey: makeDeliveryKey("connection", matchId, "thread", "email"),
        matchId,
      }),
    );
  }

  for (const { side, me, other } of sides) {
    if (!bothHaveEmail && me.email) {
      const message = connectionEmail({
        toName: me.name,
        otherName: other.name,
        otherEmail: other.email,
        city: me.city || other.city,
      });
      queued.push(
        queueEmailDelivery({
          kind: `connection_email_${side}`,
          to: me.email,
          subject: message.subject,
          html: message.html,
          text: message.text,
          idempotencyKey: makeDeliveryKey("connection", matchId, side, "email"),
          matchId,
          personId: me.id,
        }),
      );
    }
    if (me.phone && me.smsConsentAt) {
      queued.push(
        queueSmsDelivery({
          kind: `connection_sms_${side}`,
          to: me.phone,
          body: connectionSms({
            toName: me.name,
            otherName: other.name,
            otherEmail: other.email,
          }),
          idempotencyKey: makeDeliveryKey("connection", matchId, side, "sms"),
          matchId,
          personId: me.id,
        }),
      );
    }
  }
  if (queued.length === 0) {
    Sentry.captureMessage(`No authorized delivery channel for connecting match ${matchId}`, "error");
    return 0;
  }
  await Promise.all(queued);
  return queued.length;
}

async function recoverConnectingMatches(): Promise<void> {
  const matches = await prisma.match.findMany({
    where: { stage: "connecting", connectedAt: null },
    select: { id: true },
    take: 25,
    orderBy: { updatedAt: "asc" },
  });
  for (const match of matches) {
    await queueConnectionDeliveries(match.id);
    await finalizeConnectionIfReady(match.id);
  }
}

let lastCleanupAt = 0;

export async function runDeliveryWorkerPass(): Promise<number> {
  await recoverConnectingMatches();
  const drained = await drainDeliveryJobs();
  const now = Date.now();
  if (now - lastCleanupAt >= CLEANUP_INTERVAL_MS) {
    lastCleanupAt = now;
    const sentBefore = new Date(now - 30 * 24 * 60 * 60_000);
    const failedBefore = new Date(now - 90 * 24 * 60 * 60_000);
    await prisma.deliveryJob.deleteMany({
      where: {
        OR: [
          { status: "sent", sentAt: { lt: sentBefore } },
          {
            status: { in: ["failed", "cancelled"] },
            updatedAt: { lt: failedBefore },
          },
        ],
        kind: { not: { startsWith: "connection_" } },
      },
    });
  }
  return drained.processed;
}

type DeliveryWorkerGlobal = typeof globalThis & {
  __mutualsDeliveryWorkerStarted?: boolean;
  __mutualsDeliveryWorkerRunning?: boolean;
};

export function startDeliveryWorker(): void {
  if (process.env.NODE_ENV !== "production") return;
  const state = globalThis as DeliveryWorkerGlobal;
  if (state.__mutualsDeliveryWorkerStarted) return;
  state.__mutualsDeliveryWorkerStarted = true;

  const schedule = (delay: number) => {
    const timer = setTimeout(() => void run(), delay);
    timer.unref();
  };
  const run = async () => {
    if (state.__mutualsDeliveryWorkerRunning) {
      schedule(IDLE_WORKER_INTERVAL_MS);
      return;
    }
    state.__mutualsDeliveryWorkerRunning = true;
    let processed = 0;
    try {
      processed = await runDeliveryWorkerPass();
    } catch (error) {
      console.error(`[delivery] worker pass failed: ${(error as Error).message}`);
      Sentry.captureException(error);
    } finally {
      state.__mutualsDeliveryWorkerRunning = false;
      schedule(processed > 0 ? BUSY_WORKER_INTERVAL_MS : IDLE_WORKER_INTERVAL_MS);
    }
  };

  void run();
}

export async function retryFailedDeliveryJob(id: string): Promise<boolean> {
  const job = await prisma.deliveryJob.findFirst({
    where: { id, status: "failed" },
  });
  if (!job) return false;
  const eligibility = await deliveryEligibility(job);
  if (!eligibility.ok) {
    await prisma.deliveryJob.updateMany({
      where: { id, status: "failed" },
      data: { status: "cancelled", lastError: eligibility.reason },
    });
    return false;
  }
  const updated = await prisma.deliveryJob.updateMany({
    where: { id, status: "failed" },
    data: {
      status: "pending",
      attempts: 0,
      availableAt: new Date(),
      lockedAt: null,
      leaseToken: null,
      lastError: null,
    },
  });
  return updated.count === 1;
}
