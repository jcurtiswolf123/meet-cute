import { randomBytes } from "node:crypto";
import { strict as assert } from "node:assert";
import type { PrismaClient } from "@prisma/client";

async function createPerson(prisma: PrismaClient, suffix: string, label: string) {
  return prisma.person.create({
    data: {
      name: `Race QA ${label}`,
      email: `race-qa-${label}-${suffix}@example.test`,
      city: "NYC",
      status: "active",
    },
  });
}

async function main() {
  if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;
  const { prisma } = await import("../src/lib/prisma");
  // Keep this verification isolated from real delivery providers. The test
  // creates only temporary example.test rows and removes them in finally.
  process.env.RESEND_API_KEY = "";
  process.env.TWILIO_ACCOUNT_SID = "";
  process.env.TWILIO_AUTH_TOKEN = "";
  process.env.TWILIO_FROM = "";

  const [{ recordInviteDecision }, { drainDeliveryJobs }] = await Promise.all([
    import("../src/lib/introductions"),
    import("../src/lib/delivery"),
  ]);
  const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
  const personIds: string[] = [];
  const matchIds: string[] = [];

  try {
    const passA = await createPerson(prisma, suffix, "pass-a");
    const passB = await createPerson(prisma, suffix, "pass-b");
    personIds.push(passA.id, passB.id);

    const passMatch = await prisma.match.create({
      data: {
        personAId: passA.id,
        personBId: passB.id,
        stage: "mutual_yes",
        aDecision: "pending",
        bDecision: "yes",
      },
    });
    matchIds.push(passMatch.id);
    const passToken = randomBytes(24).toString("base64url");
    await prisma.matchInvite.create({
      data: { matchId: passMatch.id, personId: passA.id, token: passToken },
    });

    const passOutcomes = await Promise.all([
      recordInviteDecision(passToken, "yes"),
      recordInviteDecision(passToken, "pass"),
    ]);
    const passState = await prisma.match.findUniqueOrThrow({ where: { id: passMatch.id } });
    assert.equal(passOutcomes.filter((outcome) => outcome.ok).length, 1);
    if (passState.stage === "connecting") {
      await drainDeliveryJobs({
        matchId: passMatch.id,
        send: async () => ({ ok: true, providerMessageId: "race-test" }),
      });
      const finalPassState = await prisma.match.findUniqueOrThrow({ where: { id: passMatch.id } });
      assert.equal(finalPassState.stage, "connected");
      assert.equal(finalPassState.aDecision, "yes");
    } else {
      assert.equal(passState.stage, "exit");
      assert.equal(passState.aDecision, "pass");
    }

    const mutualA = await createPerson(prisma, suffix, "mutual-a");
    const mutualB = await createPerson(prisma, suffix, "mutual-b");
    personIds.push(mutualA.id, mutualB.id);

    const mutualMatch = await prisma.match.create({
      data: {
        personAId: mutualA.id,
        personBId: mutualB.id,
        stage: "invited",
        aDecision: "pending",
        bDecision: "pending",
      },
    });
    matchIds.push(mutualMatch.id);
    const tokenA = randomBytes(24).toString("base64url");
    const tokenB = randomBytes(24).toString("base64url");
    await prisma.matchInvite.createMany({
      data: [
        { matchId: mutualMatch.id, personId: mutualA.id, token: tokenA },
        { matchId: mutualMatch.id, personId: mutualB.id, token: tokenB },
      ],
    });

    await Promise.all([
      recordInviteDecision(tokenA, "yes"),
      recordInviteDecision(tokenB, "yes"),
    ]);
    await drainDeliveryJobs({
      matchId: mutualMatch.id,
      send: async () => ({ ok: true, providerMessageId: "race-test" }),
    });
    const mutualState = await prisma.match.findUniqueOrThrow({ where: { id: mutualMatch.id } });
    const handoffCount = await prisma.introMessage.count({
      where: { matchId: mutualMatch.id, kind: { in: ["group_open", "system"] } },
    });
    assert.equal(mutualState.stage, "connected");
    assert.equal(mutualState.aDecision, "yes");
    assert.equal(mutualState.bDecision, "yes");
    assert.equal(handoffCount, 1, "Concurrent mutual yes must produce one handoff");

    console.log("Introduction race checks passed.");
  } finally {
    if (matchIds.length) {
      await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
    }
    if (personIds.length) {
      await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    }
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
