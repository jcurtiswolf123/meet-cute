import { createHash, randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import type { DeliveryJob, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { connectionEmail, sendEmail } from "./email";
import { normalizePhone, sendConversationMessage, sendSMS } from "./sms";

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
    },
    args.db,
  );
}

export async function queueSmsDelivery(args: {
  kind: string;
  to: string;
  body: string;
  idempotencyKey: string;
  matchId?: string | null;
  personId?: string | null;
  db?: Prisma.TransactionClient;
}): Promise<DeliveryJob> {
  return enqueueDelivery(
    {
      channel: "sms",
      kind: args.kind,
      recipient: args.to,
      payload: { to: args.to, body: args.body },
      idempotencyKey: args.idempotencyKey,
      matchId: args.matchId,
      personId: args.personId,
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
    return sendEmail({
      to,
      subject: stringField(payload, "subject"),
      html: stringField(payload, "html"),
      text: typeof payload.text === "string" ? payload.text : undefined,
      replyTo: typeof payload.replyTo === "string" ? payload.replyTo : undefined,
      headers,
      idempotencyKey: job.idempotencyKey,
    });
  }
  if (job.channel === "sms") {
    return sendSMS({
      to: stringField(payload, "to"),
      body: stringField(payload, "body"),
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
  const successfulRecipients = await prisma.deliveryJob.findMany({
    where: {
      matchId,
      kind: { startsWith: "connection_" },
      status: "sent",
      personId: { in: [matchState.personAId, matchState.personBId] },
    },
    select: { personId: true },
    distinct: ["personId"],
  });
  const delivered = new Set(successfulRecipients.map((job) => job.personId));
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
        personA: { select: { smsConsentAt: true } },
        personB: { select: { smsConsentAt: true } },
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
        select: { id: true, name: true, email: true, phone: true, city: true, smsConsentAt: true },
      },
      personB: {
        select: { id: true, name: true, email: true, phone: true, city: true, smsConsentAt: true },
      },
    },
  });
  if (!match || match.stage !== "connecting") return 0;

  const sides = [
    { side: "a", me: match.personA, other: match.personB },
    { side: "b", me: match.personB, other: match.personA },
  ] as const;
  const queued: Promise<DeliveryJob>[] = [];
  for (const { side, me, other } of sides) {
    if (me.email) {
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
  __meetCuteDeliveryWorkerStarted?: boolean;
  __meetCuteDeliveryWorkerRunning?: boolean;
};

export function startDeliveryWorker(): void {
  if (process.env.NODE_ENV !== "production") return;
  const state = globalThis as DeliveryWorkerGlobal;
  if (state.__meetCuteDeliveryWorkerStarted) return;
  state.__meetCuteDeliveryWorkerStarted = true;

  const schedule = (delay: number) => {
    const timer = setTimeout(() => void run(), delay);
    timer.unref();
  };
  const run = async () => {
    if (state.__meetCuteDeliveryWorkerRunning) {
      schedule(IDLE_WORKER_INTERVAL_MS);
      return;
    }
    state.__meetCuteDeliveryWorkerRunning = true;
    let processed = 0;
    try {
      processed = await runDeliveryWorkerPass();
    } catch (error) {
      console.error(`[delivery] worker pass failed: ${(error as Error).message}`);
      Sentry.captureException(error);
    } finally {
      state.__meetCuteDeliveryWorkerRunning = false;
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
