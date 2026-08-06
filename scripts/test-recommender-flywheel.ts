// The growth loop: a friend who vouches becomes a member, and brings one more.
//
// The parts worth asserting are the ones that quietly stop working. The credit
// has to be earned (you vouched for a real member) and nothing else can earn
// it. The attribution has to be written or the funnel is
// unmeasurable and nobody notices for months. And the two scheduled messages
// have to be withdrawn when the thing they were going to ask about has already
// happened, because a nudge sent to someone who already replied is the fastest
// way to teach recommenders to ignore this mail.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import {
  REQUIRED_RECOMMENDATIONS,
  fastTrackFor,
  linkRecommenderSignup,
  requiredNewRecommenders,
  saveRecommenders,
} from "../src/lib/recommendations";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("The flywheel checks require an isolated local database.");
}

async function person(gender: string, status: string, email?: string) {
  return prisma.person.create({
    data: {
      name: `Flywheel ${randomUUID().slice(0, 6)}`,
      email: email ?? `flywheel-${randomUUID()}@example.test`,
      city: "NYC",
      gender,
      status,
      appliedAt: new Date(),
      ...(status === "active" ? { acceptedAt: new Date() } : {}),
    },
  });
}

async function wrote(recommendationId: string, body = "A real recommendation.") {
  await prisma.recommendation.update({
    where: { id: recommendationId },
    data: { status: "submitted", submittedAt: new Date(), body },
  });
}

async function main() {
  const created: string[] = [];
  try {
    // --- the credit is earned by vouching for a member ---------------------
    const member = await person("woman", "active");
    created.push(member.id);
    const friendEmail = `flywheel-friend-${randomUUID()}@example.test`;
    const [request] = await saveRecommenders(member.id, [
      { name: "Ted Friend", email: friendEmail, gender: "man" },
    ]);

    assert.equal(
      await fastTrackFor(friendEmail),
      null,
      "A request nobody has answered yet earns nothing.",
    );

    await wrote(request.id);
    const credit = await fastTrackFor(friendEmail);
    assert.ok(credit, "Vouching for a live member earns the credit.");
    assert.equal(credit!.member.id, member.id);
    assert.equal(requiredNewRecommenders(credit), REQUIRED_RECOMMENDATIONS - 1);
    assert.equal(requiredNewRecommenders(null), REQUIRED_RECOMMENDATIONS);

    // Gender used to decide whether the credit survived, because the gate was
    // an opposite-gender rule: a woman who vouched for a woman was told to find
    // two men anyway. Any two friends count since 2026-08-06, so vouching for a
    // member of the same gender earns exactly the same credit.
    const sameGenderMember = await person("woman", "active");
    created.push(sameGenderMember.id);
    const sisterEmail = `flywheel-sister-${randomUUID()}@example.test`;
    const [sisterRequest] = await saveRecommenders(sameGenderMember.id, [
      { name: "Her Friend", email: sisterEmail, gender: "woman" },
    ]);
    await wrote(sisterRequest.id);
    assert.ok(
      await fastTrackFor(sisterEmail),
      "The credit no longer depends on who is which gender.",
    );

    // --- vouching for someone who never got in earns nothing ---------------
    const rejected = await person("woman", "exited");
    created.push(rejected.id);
    const bystanderEmail = `flywheel-bystander-${randomUUID()}@example.test`;
    const [bystander] = await saveRecommenders(rejected.id, [
      { name: "Bystander", email: bystanderEmail, gender: "man" },
    ]);
    await wrote(bystander.id);
    assert.equal(
      await fastTrackFor(bystanderEmail),
      null,
      "Vouching for someone who was declined is not a credential.",
    );

    // --- the recommender signs up: attribution and the mutual vouch ---------
    const converted = await person("man", "applicant", friendEmail);
    created.push(converted.id);
    const linked = await linkRecommenderSignup({ id: converted.id, email: friendEmail });
    assert.equal(linked, 1, "The recommendation they wrote must be stamped with who they became.");

    const stamped = await prisma.recommendation.findUniqueOrThrow({ where: { id: request.id } });
    assert.equal(stamped.convertedPersonId, converted.id, "Without this the funnel is unmeasurable.");
    assert.ok(stamped.convertedAt);
    assert.equal(
      await prisma.vouch.count({ where: { voucherId: converted.id, subjectId: member.id } }),
      1,
      "A member-to-member vouch is written for the recommendation they had already given.",
    );

    // Running it twice must not double-count: this runs on every application.
    assert.equal(
      await linkRecommenderSignup({ id: converted.id, email: friendEmail }),
      0,
      "Linking is idempotent.",
    );

    // --- an address that never vouched for anyone --------------------------
    assert.equal(await fastTrackFor(`stranger-${randomUUID()}@example.test`), null);
    assert.equal(await fastTrackFor(null), null);
    assert.equal(await fastTrackFor(""), null);

    console.log(
      "flywheel checks passed: the credit is earned only by vouching for a live member, signups are attributed back to the recommendation, and linking is idempotent",
    );
  } finally {
    // Vouch has no cascade (deleteAccount deletes them by hand for the same
    // reason), so they have to go before the people they point at.
    await prisma.vouch.deleteMany({
      where: { OR: [{ voucherId: { in: created } }, { subjectId: { in: created } }] },
    });
    await prisma.person.deleteMany({ where: { id: { in: created } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
