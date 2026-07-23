import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { DeliverySendResult } from "../src/lib/delivery";

async function main() {
  if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;
  const [{ prisma }, delivery] = await Promise.all([
    import("../src/lib/prisma"),
    import("../src/lib/delivery"),
  ]);
  const { drainDeliveryJobs, enqueueDelivery, makeDeliveryKey } = delivery;
  const runId = randomUUID();
  const prefix = `qa-delivery-${runId}`;
  const key = (name: string) => makeDeliveryKey(prefix, name);
  const smsInput = (name: string) => ({
    channel: "sms" as const,
    kind: "qa",
    recipient: "+15555550123",
    payload: { to: "+15555550123", body: `QA ${name}` },
    idempotencyKey: key(name),
  });
  const emailInput = (name: string) => ({
    channel: "email" as const,
    kind: "qa",
    recipient: "qa@example.invalid",
    payload: {
      to: ["qa@example.invalid"],
      subject: `QA ${name}`,
      html: `<p>QA ${name}</p>`,
    },
    idempotencyKey: key(name),
  });
  const people: string[] = [];
  const matches: string[] = [];

  const success = async (): Promise<DeliverySendResult> => ({
    ok: true,
    providerMessageId: `provider-${runId}`,
  });

  try {
    const [first, duplicate] = await Promise.all([
      enqueueDelivery(smsInput("dedupe")),
      enqueueDelivery(smsInput("dedupe")),
    ]);
    assert.equal(first.id, duplicate.id);
    assert.equal(
      await prisma.deliveryJob.count({ where: { idempotencyKey: key("dedupe") } }),
      1,
    );

    let sends = 0;
    await Promise.all([
      drainDeliveryJobs({
        limit: 1,
        idempotencyPrefix: prefix,
        send: async () => {
          sends += 1;
          await new Promise((resolve) => setTimeout(resolve, 50));
          return success();
        },
      }),
      drainDeliveryJobs({
        limit: 1,
        idempotencyPrefix: prefix,
        send: async () => {
          sends += 1;
          return success();
        },
      }),
    ]);
    assert.equal(sends, 1);
    const sent = await prisma.deliveryJob.findUniqueOrThrow({
      where: { idempotencyKey: key("dedupe") },
    });
    assert.equal(sent.status, "sent");
    assert.equal(sent.providerMessageId, `provider-${runId}`);
    assert.ok(sent.sentAt);

    const retryJob = await enqueueDelivery(smsInput("retry"));
    await drainDeliveryJobs({
      limit: 1,
      idempotencyPrefix: prefix,
      send: async () => ({
        ok: false,
        retryable: true,
        error: "temporary provider error",
      }),
    });
    const retried = await prisma.deliveryJob.findUniqueOrThrow({ where: { id: retryJob.id } });
    assert.equal(retried.status, "pending");
    assert.equal(retried.attempts, 1);
    assert.match(retried.lastError ?? "", /temporary provider error/);
    assert.ok(retried.availableAt.getTime() > Date.now());

    const staleEmail = await enqueueDelivery(emailInput("stale-email"));
    await prisma.deliveryJob.update({
      where: { id: staleEmail.id },
      data: {
        status: "processing",
        lockedAt: new Date(Date.now() - 10 * 60_000),
        leaseToken: randomUUID(),
      },
    });
    await drainDeliveryJobs({ limit: 1, idempotencyPrefix: prefix, send: success });
    assert.equal(
      (await prisma.deliveryJob.findUniqueOrThrow({ where: { id: staleEmail.id } })).status,
      "sent",
    );

    const staleSms = await enqueueDelivery(smsInput("stale-sms"));
    await prisma.deliveryJob.update({
      where: { id: staleSms.id },
      data: {
        status: "processing",
        lockedAt: new Date(Date.now() - 10 * 60_000),
        leaseToken: randomUUID(),
      },
    });
    let staleSmsSends = 0;
    await drainDeliveryJobs({
      limit: 1,
      idempotencyPrefix: prefix,
      send: async () => {
        staleSmsSends += 1;
        return success();
      },
    });
    const staleSmsAfter = await prisma.deliveryJob.findUniqueOrThrow({
      where: { id: staleSms.id },
    });
    assert.equal(staleSmsSends, 0);
    assert.equal(staleSmsAfter.status, "failed");
    assert.match(staleSmsAfter.lastError ?? "", /outcome is unknown/i);

    const consentPerson = await prisma.person.create({
      data: {
        name: "Delivery Consent QA",
        email: `delivery-consent-${runId}@example.invalid`,
        phone: "+15555550124",
        city: "NYC",
        status: "active",
        smsConsentAt: new Date(),
      },
    });
    people.push(consentPerson.id);
    const consentJob = await enqueueDelivery({
      ...smsInput("consent"),
      recipient: consentPerson.phone!,
      payload: { to: consentPerson.phone!, body: "Consent QA" },
      personId: consentPerson.id,
    });
    await prisma.person.update({
      where: { id: consentPerson.id },
      data: { smsConsentAt: null },
    });
    let postOptOutSends = 0;
    await drainDeliveryJobs({
      limit: 1,
      idempotencyPrefix: prefix,
      send: async () => {
        postOptOutSends += 1;
        return success();
      },
    });
    assert.equal(postOptOutSends, 0);
    assert.equal(
      (await prisma.deliveryJob.findUniqueOrThrow({ where: { id: consentJob.id } })).status,
      "cancelled",
    );

    const [personA, personB] = await Promise.all(
      ["a", "b"].map((side) =>
        prisma.person.create({
          data: {
            name: `Connection QA ${side.toUpperCase()}`,
            email: `connection-${runId}-${side}@example.invalid`,
            phone: side === "a" ? "+15555550125" : "+15555550126",
            city: "NYC",
            status: "active",
            smsConsentAt: new Date(),
          },
        }),
      ),
    );
    people.push(personA.id, personB.id);
    const connection = await prisma.match.create({
      data: {
        personAId: personA.id,
        personBId: personB.id,
        stage: "connecting",
        aDecision: "yes",
        bDecision: "yes",
      },
    });
    matches.push(connection.id);
    await enqueueDelivery({
      channel: "sms",
      kind: "connection_sms_a",
      recipient: personA.phone!,
      payload: { to: personA.phone!, body: "Connection QA optional SMS" },
      idempotencyKey: key("connection-a-sms"),
      matchId: connection.id,
      personId: personA.id,
      maxAttempts: 1,
    });
    for (const [side, person] of [
      ["a", personA],
      ["b", personB],
    ] as const) {
      await enqueueDelivery({
        channel: "email",
        kind: `connection_email_${side}`,
        recipient: person.email!,
        payload: {
          to: [person.email!],
          subject: "Connection QA",
          html: "<p>Connection QA</p>",
        },
        idempotencyKey: key(`connection-${side}-email`),
        matchId: connection.id,
        personId: person.id,
      });
    }
    await drainDeliveryJobs({
      limit: 5,
      matchId: connection.id,
      send: async (job) =>
        job.channel === "sms"
          ? { ok: false, retryable: false, error: "optional SMS failed" }
          : success(),
    });
    const connected = await prisma.match.findUniqueOrThrow({
      where: { id: connection.id },
    });
    assert.equal(connected.stage, "connected");
    assert.ok(connected.connectedAt);
    assert.equal(
      await prisma.deliveryJob.count({
        where: { matchId: connection.id, status: "failed" },
      }),
      0,
    );
  } finally {
    await prisma.deliveryJob
      .deleteMany({ where: { idempotencyKey: { startsWith: prefix } } })
      .catch(() => {});
    if (matches.length) {
      await prisma.match.deleteMany({ where: { id: { in: matches } } }).catch(() => {});
    }
    if (people.length) {
      await prisma.person.deleteMany({ where: { id: { in: people } } }).catch(() => {});
    }
    await prisma.$disconnect();
  }

  console.log("delivery outbox checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
