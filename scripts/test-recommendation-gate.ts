// The recommendation gate: two friends of the opposite gender have to write
// back before an applicant is accepted.
//
// This exercises the rule and the state transition directly against the
// database, because the parts that can actually go wrong are concurrency (two
// friends submitting at once must accept once, not twice), idempotency (a
// re-submitted application must not re-mail a friend who already answered), and
// the opposite-gender rule itself.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import {
  REQUIRED_RECOMMENDATIONS,
  acceptIfRecommended,
  countsTowardGate,
  gateState,
  remainingRequired,
  saveRecommenders,
} from "../src/lib/recommendations";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("The recommendation gate checks require an isolated local database.");
}

function pure() {
  // A woman needs two men, a man needs two women.
  assert.equal(countsTowardGate("woman", "man"), true);
  assert.equal(countsTowardGate("woman", "woman"), false);
  assert.equal(countsTowardGate("man", "woman"), true);
  assert.equal(countsTowardGate("man", "man"), false);
  // Nonbinary applicants have no opposite to require, so any two friends count.
  // Locking them out, or making them mislabel a friend to get in, is not a
  // rule - it is a bug with a policy attached.
  assert.equal(countsTowardGate("nonbinary", "woman"), true);
  assert.equal(countsTowardGate("nonbinary", "nonbinary"), true);
  // An applicant with no gender on file (every one of the 25 people on the
  // roster before this change) is not blocked by a rule they were never asked.
  assert.equal(countsTowardGate(null, "man"), true);

  assert.equal(remainingRequired("man", []), REQUIRED_RECOMMENDATIONS);
  assert.equal(
    remainingRequired("man", [
      { status: "submitted", gender: "woman" },
      { status: "requested", gender: "woman" },
    ]),
    1,
  );
  assert.equal(
    remainingRequired("man", [
      { status: "submitted", gender: "woman" },
      { status: "submitted", gender: "woman" },
    ]),
    0,
  );
  // Two men vouching for a man is two recommendations and zero progress.
  assert.equal(
    remainingRequired("man", [
      { status: "submitted", gender: "man" },
      { status: "submitted", gender: "man" },
    ]),
    REQUIRED_RECOMMENDATIONS,
  );
  console.log("  pure: opposite-gender rule and remaining count");
}

async function makeApplicant(gender: string) {
  return prisma.person.create({
    data: {
      name: `Gate Applicant ${randomUUID().slice(0, 8)}`,
      email: `gate-${randomUUID()}@example.test`,
      city: "NYC",
      gender,
      status: "applicant",
      appliedAt: new Date(),
    },
  });
}

async function write(recommendationId: string, body: string) {
  await prisma.recommendation.updateMany({
    where: { id: recommendationId, status: "requested" },
    data: { status: "submitted", submittedAt: new Date(), body },
  });
}

async function main() {
  pure();
  const created: string[] = [];

  try {
    // --- the happy path: two women vouch for a man, and he is in -------------
    const man = await makeApplicant("man");
    created.push(man.id);
    const saved = await saveRecommenders(man.id, [
      { name: "Ada Vouch", email: `ada-${randomUUID()}@example.test`, gender: "woman" },
      { name: "Grace Vouch", email: `grace-${randomUUID()}@example.test`, gender: "woman" },
    ]);
    assert.equal(saved.length, 2);
    assert.ok(saved[0].token && saved[1].token);
    assert.notEqual(saved[0].token, saved[1].token, "Each request needs its own capability token.");

    let outcome = await acceptIfRecommended(man.id);
    assert.equal(outcome.accepted, false, "Nobody is accepted before a friend writes anything.");
    assert.equal(outcome.remaining, REQUIRED_RECOMMENDATIONS);

    await write(saved[0].id, "Ada would tell you he is the most reliable person she knows.");
    outcome = await acceptIfRecommended(man.id);
    assert.equal(outcome.accepted, false, "One recommendation is not two.");
    assert.equal(outcome.remaining, 1);
    assert.equal(
      (await prisma.person.findUniqueOrThrow({ where: { id: man.id } })).status,
      "applicant",
    );

    await write(saved[1].id, "Grace has known him for a decade and would set up her sister with him.");
    outcome = await acceptIfRecommended(man.id);
    assert.equal(outcome.accepted, true, "Two recommendations accept the applicant.");
    assert.equal(outcome.justAccepted, true);

    const accepted = await prisma.person.findUniqueOrThrow({ where: { id: man.id } });
    assert.equal(accepted.status, "active");
    assert.ok(accepted.acceptedAt);
    assert.equal(
      accepted.recommendation,
      "Ada would tell you he is the most reliable person she knows.",
      "The first recommendation is copied onto the profile field the introduction email reads.",
    );
    assert.equal(accepted.voucherName, "Ada Vouch");

    // Accepting is a transition, not a state check: a second call must not
    // report justAccepted again, or a member gets two welcome emails.
    const again = await acceptIfRecommended(man.id);
    assert.equal(again.accepted, true);
    assert.equal(again.justAccepted, false, "Acceptance must fire exactly once.");

    // Two friends answering at the same moment: exactly one of them is the one
    // that lets the applicant in.
    const racer = await makeApplicant("woman");
    created.push(racer.id);
    const racerRecs = await saveRecommenders(racer.id, [
      { name: "Alan Vouch", email: `alan-${randomUUID()}@example.test`, gender: "man" },
      { name: "Tim Vouch", email: `tim-${randomUUID()}@example.test`, gender: "man" },
    ]);
    await Promise.all(racerRecs.map((r, i) => write(r.id, `Recommendation number ${i + 1}, written at the same moment.`)));
    const outcomes = await Promise.all([
      acceptIfRecommended(racer.id),
      acceptIfRecommended(racer.id),
      acceptIfRecommended(racer.id),
    ]);
    assert.equal(
      outcomes.filter((o) => o.justAccepted).length,
      1,
      "Concurrent submissions must accept the applicant exactly once.",
    );

    // --- the rule bites: two men cannot vouch a man in ----------------------
    const sameGender = await makeApplicant("man");
    created.push(sameGender.id);
    const sameRecs = await saveRecommenders(sameGender.id, [
      { name: "Bob Vouch", email: `bob-${randomUUID()}@example.test`, gender: "man" },
      { name: "Carl Vouch", email: `carl-${randomUUID()}@example.test`, gender: "man" },
    ]);
    await Promise.all(sameRecs.map((r) => write(r.id, "A perfectly nice recommendation that does not count.")));
    const sameOutcome = await acceptIfRecommended(sameGender.id);
    assert.equal(sameOutcome.accepted, false, "Two same-gender recommendations do not open the door.");
    assert.equal(
      (await prisma.person.findUniqueOrThrow({ where: { id: sameGender.id } })).status,
      "applicant",
    );
    const sameState = await gateState(sameGender.id);
    assert.equal(sameState.submitted.length, 2, "Both recommendations are still recorded.");
    assert.equal(sameState.qualifying.length, 0, "Neither counts toward the gate.");

    // --- a nonbinary applicant needs two friends and no gender arithmetic ---
    const nb = await makeApplicant("nonbinary");
    created.push(nb.id);
    const nbRecs = await saveRecommenders(nb.id, [
      { name: "Robin Vouch", email: `robin-${randomUUID()}@example.test`, gender: "nonbinary" },
      { name: "Sam Vouch", email: `sam-${randomUUID()}@example.test`, gender: "man" },
    ]);
    await Promise.all(nbRecs.map((r) => write(r.id, "Two friends, no opposite required.")));
    assert.equal((await acceptIfRecommended(nb.id)).accepted, true);

    // --- re-submitting an application does not re-ask a friend who answered --
    const editor = await makeApplicant("woman");
    created.push(editor.id);
    const firstEmail = `first-${randomUUID()}@example.test`;
    const [firstRequest] = await saveRecommenders(editor.id, [
      { name: "First Friend", email: firstEmail, gender: "man" },
    ]);
    await write(firstRequest.id, "Written once, and it should survive an edit to the application.");
    const resaved = await saveRecommenders(editor.id, [
      { name: "First Friend Renamed", email: firstEmail, gender: "man" },
      { name: "Second Friend", email: `second-${randomUUID()}@example.test`, gender: "man" },
    ]);
    assert.equal(resaved[0].id, firstRequest.id, "The same friend is the same request row.");
    assert.equal(resaved[0].status, "submitted", "A friend who answered is left alone.");
    assert.equal(
      resaved[0].body,
      "Written once, and it should survive an edit to the application.",
      "Re-submitting an application must never overwrite what a friend wrote.",
    );
    assert.equal(resaved[0].name, "First Friend", "Nor rename them out from under their words.");
    assert.equal(resaved[1].status, "requested", "The newly named friend is asked.");
    assert.equal(
      await prisma.recommendation.count({ where: { applicantId: editor.id } }),
      2,
      "Editing an application does not duplicate requests.",
    );

    // --- a declined applicant is not revived by a late recommendation -------
    const declined = await makeApplicant("man");
    created.push(declined.id);
    const declinedRecs = await saveRecommenders(declined.id, [
      { name: "Late One", email: `late1-${randomUUID()}@example.test`, gender: "woman" },
      { name: "Late Two", email: `late2-${randomUUID()}@example.test`, gender: "woman" },
    ]);
    await prisma.person.update({ where: { id: declined.id }, data: { status: "exited" } });
    await Promise.all(declinedRecs.map((r) => write(r.id, "A recommendation that arrives too late.")));
    const declinedOutcome = await acceptIfRecommended(declined.id);
    assert.equal(declinedOutcome.justAccepted, false);
    assert.equal(
      (await prisma.person.findUniqueOrThrow({ where: { id: declined.id } })).status,
      "exited",
      "A declined applicant stays declined.",
    );

    console.log(
      "recommendation gate passed: opposite-gender rule, one-shot acceptance under concurrency, edit-safe requests, and no revival of a declined applicant",
    );
  } finally {
    await prisma.person.deleteMany({ where: { id: { in: created } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
