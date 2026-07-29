import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { DeliveryJob } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (
  !databaseUrl ||
  !["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname)
) {
  throw new Error("Match email journey checks require an isolated local database.");
}

process.env.NEXT_PUBLIC_APP_URL = "https://journey.meetcute.test";
process.env.RESEND_INBOUND_DOMAIN = "inbound.meetcute.test";
const webhookKey = randomBytes(32);
process.env.RESEND_WEBHOOK_SECRET = `whsec_${webhookKey.toString("base64")}`;
process.env.RESEND_API_KEY = "journey-test-key";

type CapturedDelivery = {
  kind: string;
  recipient: string;
  payload: Record<string, unknown>;
};

function payload(job: DeliveryJob): Record<string, unknown> {
  assert.ok(job.payload && typeof job.payload === "object" && !Array.isArray(job.payload));
  return job.payload as Record<string, unknown>;
}

function signedInboundRequest(args: {
  token: string;
  text?: string;
  emailId?: string;
  domain?: string;
  timestamp?: number;
}): NextRequest {
  const body = JSON.stringify({
    type: "email.received",
    data: {
      to: [`Meet Cute <r+${args.token}@${args.domain || "inbound.meetcute.test"}>`],
      ...(args.text ? { text: args.text } : {}),
      ...(args.emailId ? { email_id: args.emailId } : {}),
    },
  });
  const id = `journey-${randomUUID()}`;
  const timestamp = String(args.timestamp ?? Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", webhookKey)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return new NextRequest("http://localhost:3009/api/email/inbound", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature}`,
    },
    body,
  });
}

async function main() {
  const [{ prisma }, delivery, introductions, inbound] = await Promise.all([
    import("../src/lib/prisma"),
    import("../src/lib/delivery"),
    import("../src/lib/introductions"),
    import("../src/app/api/email/inbound/route"),
  ]);
  const { drainDeliveryJobs, queueConnectionDeliveries } = delivery;
  const { sendEmailInvites } = introductions;
  const suffix = randomUUID();
  const people: string[] = [];
  const matches: string[] = [];
  const captures: CapturedDelivery[] = [];
  const originalFetch = globalThis.fetch;

  const createPerson = async (label: string) => {
    const person = await prisma.person.create({
      data: {
        name: `Journey ${label}`,
        email: `journey-${label.toLowerCase()}-${suffix}@example.test`,
        city: "NYC",
        status: "active",
        openToMatch: true,
        appliedAt: new Date(),
        agreedTosAt: new Date(),
      },
    });
    people.push(person.id);
    return person;
  };

  const captureSender = async (job: DeliveryJob) => {
    captures.push({
      kind: job.kind,
      recipient: job.recipient,
      payload: payload(job),
    });
    return {
      ok: true as const,
      providerMessageId: `journey-provider-${captures.length}`,
    };
  };

  try {
    const [yesA, yesB, noA, noB] = await Promise.all([
      createPerson("Yes A"),
      createPerson("Yes B"),
      createPerson("No A"),
      createPerson("No B"),
    ]);

    const yesMatch = await prisma.match.create({
      data: {
        personAId: yesA.id,
        personBId: yesB.id,
        stage: "invited",
      },
    });
    matches.push(yesMatch.id);

    assert.equal(await sendEmailInvites(yesMatch.id), 2);
    await drainDeliveryJobs({
      matchId: yesMatch.id,
      limit: 10,
      send: captureSender,
    });

    const yesInvites = await prisma.matchInvite.findMany({
      where: { matchId: yesMatch.id },
      orderBy: { personId: "asc" },
    });
    assert.equal(yesInvites.length, 2);
    const inviteDeliveries = captures.filter((capture) =>
      capture.kind.startsWith("intro_invite_"),
    );
    assert.equal(inviteDeliveries.length, 2);
    assert.deepEqual(
      new Set(inviteDeliveries.map((capture) => String((capture.payload.to as string[])[0]))),
      new Set([yesA.email!, yesB.email!]),
    );
    for (const capture of inviteDeliveries) {
      assert.match(String(capture.payload.replyTo), /^Meet Cute <r\+[A-Za-z0-9_-]+@/);
      assert.match(String(capture.payload.html), /profile &amp; decide/i);
    }

    const yesAToken = yesInvites.find((invite) => invite.personId === yesA.id)!.token;
    const staleReply = await inbound.POST(
      signedInboundRequest({
        token: yesAToken,
        text: "Y",
        timestamp: Math.floor(Date.now() / 1000) - 10 * 60,
      }),
    );
    assert.equal(staleReply.status, 403);

    const foreignDomainReply = await inbound.POST(
      signedInboundRequest({
        token: yesAToken,
        text: "Y",
        domain: "other-project.test",
      }),
    );
    assert.equal(foreignDomainReply.status, 200);
    assert.equal(await foreignDomainReply.text(), "no token");

    // A legacy reply domain stays accepted while invites carrying its Reply-To
    // are still outstanding, but invites are only ever sent from the first one.
    // Without this, changing the reply address silently drops in-flight replies.
    const singleDomain = process.env.RESEND_INBOUND_DOMAIN!;
    process.env.RESEND_INBOUND_DOMAIN = `new.meetcute.test, ${singleDomain}`;
    assert.match(
      introductions.inviteReplyAddress("sample-token")!,
      /@new\.meetcute\.test>$/,
      "new invites must use the first configured domain",
    );
    const legacyDomainReply = await inbound.POST(
      signedInboundRequest({
        token: yesAToken,
        text: "Maybe? Let me think about it",
        domain: singleDomain,
      }),
    );
    assert.equal(legacyDomainReply.status, 200);
    assert.equal(
      await legacyDomainReply.text(),
      "no decision",
      "a legacy-domain reply must reach the parser, and 'maybe' decides nothing",
    );
    process.env.RESEND_INBOUND_DOMAIN = singleDomain;

    globalThis.fetch = async (input) => {
      assert.match(String(input), /api\.resend\.com\/emails\/receiving\/journey-received-a$/);
      return new Response(JSON.stringify({ text: "Y\n\nOn the earlier email..." }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const firstYes = await inbound.POST(
      signedInboundRequest({
        token: yesAToken,
        emailId: "journey-received-a",
      }),
    );
    assert.equal(firstYes.status, 200);
    assert.equal(await firstYes.text(), "ok");
    const afterFirstYes = await prisma.match.findUniqueOrThrow({
      where: { id: yesMatch.id },
    });
    assert.equal(afterFirstYes.stage, "mutual_yes");
    assert.equal(afterFirstYes.aDecision, "yes");
    assert.equal(afterFirstYes.bDecision, "pending");

    const secondYes = await inbound.POST(
      signedInboundRequest({
        token: yesInvites.find((invite) => invite.personId === yesB.id)!.token,
        text: "Yes, please",
      }),
    );
    assert.equal(secondYes.status, 200);
    assert.equal(await secondYes.text(), "ok");

    const threadJobs = await prisma.deliveryJob.findMany({
      where: { matchId: yesMatch.id, kind: "connection_email_thread" },
    });
    assert.equal(threadJobs.length, 1);
    const threadPayload = payload(threadJobs[0]);
    assert.deepEqual(
      new Set(threadPayload.to as string[]),
      new Set([yesA.email!, yesB.email!]),
    );
    assert.match(String(threadPayload.subject), /you both said yes/i);
    assert.equal(
      await prisma.deliveryJob.count({
        where: {
          matchId: yesMatch.id,
          kind: { in: ["connection_email_a", "connection_email_b"] },
        },
      }),
      0,
    );

    const beforeThreadCapture = captures.length;
    await drainDeliveryJobs({
      matchId: yesMatch.id,
      limit: 10,
      send: captureSender,
    });
    const threadCaptures = captures
      .slice(beforeThreadCapture)
      .filter((capture) => capture.kind === "connection_email_thread");
    assert.equal(threadCaptures.length, 1);
    assert.deepEqual(
      new Set(threadCaptures[0].payload.to as string[]),
      new Set([yesA.email!, yesB.email!]),
    );
    const connected = await prisma.match.findUniqueOrThrow({
      where: { id: yesMatch.id },
    });
    assert.equal(connected.stage, "connected");
    assert.ok(connected.connectedAt);

    const noMatch = await prisma.match.create({
      data: {
        personAId: noA.id,
        personBId: noB.id,
        stage: "invited",
      },
    });
    matches.push(noMatch.id);
    assert.equal(await sendEmailInvites(noMatch.id), 2);
    await drainDeliveryJobs({
      matchId: noMatch.id,
      limit: 10,
      send: captureSender,
    });
    const noInvite = await prisma.matchInvite.findFirstOrThrow({
      where: { matchId: noMatch.id, personId: noA.id },
    });
    const noReply = await inbound.POST(
      signedInboundRequest({
        token: noInvite.token,
        text: "No, thank you",
      }),
    );
    assert.equal(noReply.status, 200);
    assert.equal(await noReply.text(), "ok");
    const declined = await prisma.match.findUniqueOrThrow({
      where: { id: noMatch.id },
    });
    assert.equal(declined.stage, "exit");
    assert.equal(declined.aDecision, "pass");
    assert.equal(declined.exitReason, "declined_email");
    assert.equal(
      await prisma.deliveryJob.count({
        where: { matchId: noMatch.id, kind: { startsWith: "connection_" } },
      }),
      0,
    );

    const [changedA, changedB] = await Promise.all([
      createPerson("Changed A"),
      createPerson("Changed B"),
    ]);
    const changedMatch = await prisma.match.create({
      data: {
        personAId: changedA.id,
        personBId: changedB.id,
        stage: "connecting",
        aDecision: "yes",
        bDecision: "yes",
      },
    });
    matches.push(changedMatch.id);
    assert.equal(await queueConnectionDeliveries(changedMatch.id), 1);
    await prisma.person.update({
      where: { id: changedA.id },
      data: { email: `journey-changed-a-new-${suffix}@example.test` },
    });
    const capturesBeforeChangedAddress = captures.length;
    await drainDeliveryJobs({
      matchId: changedMatch.id,
      limit: 10,
      send: captureSender,
    });
    assert.equal(captures.length, capturesBeforeChangedAddress);
    const cancelledThread = await prisma.deliveryJob.findFirstOrThrow({
      where: { matchId: changedMatch.id, kind: "connection_email_thread" },
    });
    assert.equal(cancelledThread.status, "cancelled");
    assert.match(cancelledThread.lastError || "", /email changed/i);

    console.log(
      "match email journey passed: invite emails, signed Y/N capture, one joint thread email, decline closure, and stale-address cancellation",
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (matches.length) {
      await prisma.match.deleteMany({ where: { id: { in: matches } } }).catch(() => {});
    }
    if (people.length) {
      await prisma.person.deleteMany({ where: { id: { in: people } } }).catch(() => {});
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
