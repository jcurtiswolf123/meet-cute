// What the composer knows about two people before the operator presses send.
//
// `createIntroduction` refuses an open invitation and a block, but only after
// the click. `pairStates` is what lets the composer say so at pick time, so the
// two must agree: anything the action refuses has to come back "open" or
// "blocked" here, and anything it allows must not.
import { randomBytes } from "node:crypto";
import { strict as assert } from "node:assert";
import type { PrismaClient } from "@prisma/client";

async function createPerson(prisma: PrismaClient, suffix: string, label: string) {
  return prisma.person.create({
    data: {
      name: `Pair QA ${label}`,
      email: `pair-qa-${label}-${suffix}@example.test`,
      city: "NYC",
      status: "active",
    },
  });
}

async function main() {
  if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;
  const { prisma } = await import("../src/lib/prisma");
  const { pairStates, LIVE_INTRO_STAGES } = await import("../src/lib/introductions");
  const { pairKey } = await import("../src/lib/pairs");

  const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
  const personIds: string[] = [];
  const matchIds: string[] = [];
  const blockIds: string[] = [];

  try {
    const [openA, openB, doneA, doneB, closedA, closedB, blockedA, blockedB, freshA, freshB] =
      await Promise.all(
        ["open-a", "open-b", "done-a", "done-b", "closed-a", "closed-b", "blocked-a", "blocked-b", "fresh-a", "fresh-b"].map(
          (label) => createPerson(prisma, suffix, label),
        ),
      );
    personIds.push(
      openA.id, openB.id, doneA.id, doneB.id, closedA.id, closedB.id, blockedA.id, blockedB.id, freshA.id, freshB.id,
    );

    const made = await Promise.all([
      prisma.match.create({ data: { personAId: openA.id, personBId: openB.id, stage: "invited" } }),
      prisma.match.create({ data: { personAId: doneA.id, personBId: doneB.id, stage: "connected" } }),
      prisma.match.create({ data: { personAId: closedA.id, personBId: closedB.id, stage: "exit" } }),
    ]);
    matchIds.push(...made.map((m) => m.id));
    const block = await prisma.block.create({ data: { blockerId: blockedA.id, blockedId: blockedB.id } });
    blockIds.push(block.id);

    const states = await pairStates();

    assert.equal(states[pairKey(openA.id, openB.id)], "open", "a live invitation must block a second one");
    // Order must not matter: the composer looks a pair up whichever way round
    // the operator picked them.
    assert.equal(states[pairKey(openB.id, openA.id)], "open", "the lookup key is order-independent");
    assert.equal(states[pairKey(doneA.id, doneB.id)], "connected", "a finished introduction is a warning, not a wall");
    assert.equal(states[pairKey(closedA.id, closedB.id)], undefined, "a closed introduction can be re-opened freely");
    assert.equal(states[pairKey(blockedA.id, blockedB.id)], "blocked", "a block is a wall in both directions");
    assert.equal(states[pairKey(blockedB.id, blockedA.id)], "blocked", "a block is a wall in both directions");
    assert.equal(states[pairKey(freshA.id, freshB.id)], undefined, "two people with no history are introducible");

    // The stages the action refuses are exactly the ones reported as open.
    for (const stage of LIVE_INTRO_STAGES) {
      await prisma.match.update({ where: { id: made[0].id }, data: { stage } });
      const round = await pairStates();
      assert.equal(round[pairKey(openA.id, openB.id)], "open", `${stage} must read as open`);
    }

    console.log(
      "pair state checks passed: a live invitation blocks a second, a block is a wall both ways, a closed introduction re-opens, and a finished one only warns",
    );
  } finally {
    if (blockIds.length) await prisma.block.deleteMany({ where: { id: { in: blockIds } } });
    if (matchIds.length) await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
    if (personIds.length) await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
