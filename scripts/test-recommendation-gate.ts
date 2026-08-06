// The recommendation gate: any two friends have to write back before an
// applicant is accepted.
//
// It was two friends OF THE OPPOSITE GENDER until 2026-08-06, and this file
// still checks the shape of that removal, because the interesting cases are the
// ones the old rule silently failed: two friends of the same gender as the
// applicant are now two answers and an acceptance.
//
// This exercises the rule and the state transition directly against the
// database, because the parts that can actually go wrong are concurrency (two
// friends submitting at once must accept once, not twice) and idempotency (a
// re-submitted application must not re-mail a friend who already answered).

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import {
  REQUIRED_RECOMMENDATIONS,
  acceptIfRecommended,
  gateState,
  hasAnswered,
  recordAnswer,
  remainingRequired,
  requiredNewRecommenders,
  syncLeadRecommendation,
  saveRecommenders,
} from "../src/lib/recommendations";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("The recommendation gate checks require an isolated local database.");
}

function pure() {
  assert.equal(remainingRequired([]), REQUIRED_RECOMMENDATIONS);
  assert.equal(
    remainingRequired([{ status: "submitted" }, { status: "requested" }]),
    1,
  );
  assert.equal(remainingRequired([{ status: "submitted" }, { status: "submitted" }]), 0);
  // A tap answers. Words answer and can be quoted. Nothing else counts.
  assert.equal(hasAnswered("endorsed"), true);
  assert.equal(hasAnswered("submitted"), true);
  assert.equal(hasAnswered("requested"), false);
  assert.equal(hasAnswered("declined"), false);
  assert.equal(
    remainingRequired([{ status: "endorsed" }, { status: "submitted" }]),
    0,
    "A tap and a written recommendation together are two answers.",
  );

  // How many names the form asks for. Two credits exist and they stack: a vouch
  // written for a member, and a recommendation already on the row (which is how
  // a nomination lands). Neither can take the ask below one unless the gate is
  // genuinely already satisfied, because the fast-track credit is a promise to
  // ask somebody rather than an answer.
  const fastTrack = { recommendationId: "x", member: { id: "m", name: "M", email: null, gender: null } };
  assert.equal(requiredNewRecommenders(null), REQUIRED_RECOMMENDATIONS);
  assert.equal(requiredNewRecommenders(fastTrack), 1);
  assert.equal(requiredNewRecommenders(null, 1), 1);
  assert.equal(requiredNewRecommenders(fastTrack, 1), 1, "Two credits still leave one real name.");
  assert.equal(requiredNewRecommenders(null, 2), 0, "Two answers already on the row ask for nobody.");
  console.log("  pure: any-two-friends counting, tap counting, and how many names to ask for");
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

    // --- two men vouching for a man is two answers, and he is in ------------
    //
    // This is the case the old opposite-gender rule failed silently: both
    // friends wrote, the applicant saw two recommendations on their page, and
    // nothing opened. People were stopping at the friends step saying they had
    // nobody of the right description to name, so Jess killed the rule on
    // 2026-08-06 and this assertion is the inverse of the one it replaced.
    const sameGender = await makeApplicant("man");
    created.push(sameGender.id);
    const sameRecs = await saveRecommenders(sameGender.id, [
      { name: "Bob Vouch", email: `bob-${randomUUID()}@example.test`, gender: "man" },
      { name: "Carl Vouch", email: `carl-${randomUUID()}@example.test`, gender: "man" },
    ]);
    await Promise.all(sameRecs.map((r) => write(r.id, "A perfectly nice recommendation, which now counts.")));
    const sameOutcome = await acceptIfRecommended(sameGender.id);
    assert.equal(sameOutcome.accepted, true, "Any two friends accept the applicant.");
    assert.equal(
      (await prisma.person.findUniqueOrThrow({ where: { id: sameGender.id } })).status,
      "active",
    );
    const sameState = await gateState(sameGender.id);
    assert.equal(sameState.submitted.length, 2, "Both recommendations are recorded.");
    assert.equal(sameState.qualifying.length, 2, "And both count toward the gate.");

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

    // --- a friend who says no ---------------------------------------------
    //
    // The status existed from the first day and nothing wrote it, so declining
    // and forgetting were the same event and both earned three reminders.
    const asked = await makeApplicant("woman");
    created.push(asked.id);
    const [sayingNo, sayingYes] = await saveRecommenders(asked.id, [
      { name: "Says No", email: `no-${randomUUID()}@example.test`, gender: "man" },
      { name: "Says Yes", email: `yes-${randomUUID()}@example.test`, gender: "man" },
    ]);

    const declineAnswer = await recordAnswer(sayingNo.token, { decline: true });
    assert.ok(declineAnswer.ok, "Declining is a real answer and must be recorded.");
    assert.equal(
      (await prisma.recommendation.findUniqueOrThrow({ where: { id: sayingNo.id } })).status,
      "declined",
    );
    assert.equal(hasAnswered("declined"), false, "It counts toward nothing.");
    assert.equal(
      (await gateState(asked.id)).remaining,
      2,
      "A decline leaves the applicant needing both, not one.",
    );

    // Saying no is final. A tap or a reply-by-email arriving afterwards must
    // not quietly undo it: somebody who declined and is then counted anyway was
    // never given a choice.
    assert.equal(
      (await recordAnswer(sayingNo.token, { endorseOnly: true })).ok,
      false,
      "A declined request cannot be revived by a later tap.",
    );
    assert.equal(
      (await recordAnswer(sayingNo.token, { body: "Actually they are great." })).ok,
      false,
      "Nor by a later reply.",
    );
    assert.equal(
      (await prisma.recommendation.findUniqueOrThrow({ where: { id: sayingNo.id } })).status,
      "declined",
    );

    // And declining is not the same as the applicant failing: the other friend
    // still counts, and the applicant is one answer away rather than out.
    await write(sayingYes.id, "She is the person I call first, and I am not the only one.");
    assert.equal((await gateState(asked.id)).remaining, 1);
    assert.equal(
      (await acceptIfRecommended(asked.id)).justAccepted,
      false,
      "One answer plus one decline is not two answers.",
    );

    // --- the three doors: tap, words, and a tap upgraded by words ----------
    const tapper = await makeApplicant("woman");
    created.push(tapper.id);
    const tapRecs = await saveRecommenders(tapper.id, [
      { name: "Tap One", email: `tap1-${randomUUID()}@example.test`, gender: "man" },
      { name: "Tap Two", email: `tap2-${randomUUID()}@example.test`, gender: "man" },
    ]);

    const firstTap = await recordAnswer(tapRecs[0].token, { endorseOnly: true });
    assert.equal(firstTap.ok, true);
    assert.equal(firstTap.ok && firstTap.request.status, "endorsed");
    assert.equal(firstTap.ok && firstTap.alreadyAnswered, false);
    assert.equal((await acceptIfRecommended(tapper.id)).accepted, false, "One tap is one answer.");

    // The same person coming back with words upgrades their own tap, and the
    // page has to know they had already answered so nobody is thanked twice.
    const upgraded = await recordAnswer(tapRecs[0].token, {
      body: "Tap One eventually wrote the words, which is the whole point of asking twice.",
    });
    assert.equal(upgraded.ok, true);
    assert.equal(upgraded.ok && upgraded.request.status, "submitted");
    assert.equal(upgraded.ok && upgraded.alreadyAnswered, true, "A second answer is not a first one.");

    const second = await recordAnswer(tapRecs[1].token, { endorseOnly: true });
    assert.equal(second.ok, true);
    const tapOutcome = await acceptIfRecommended(tapper.id);
    assert.equal(tapOutcome.accepted, true, "A tap and words are two answers, and two accepts.");
    const tapped = await prisma.person.findUniqueOrThrow({ where: { id: tapper.id } });
    assert.match(
      tapped.recommendation ?? "",
      /eventually wrote the words/,
      "The quote must come from the row with words, never from a bare tap.",
    );
    assert.equal(tapped.voucherName, "Tap One");

    // A tap alone never puts words in anyone's mouth.
    const silent = await makeApplicant("man");
    created.push(silent.id);
    const silentRecs = await saveRecommenders(silent.id, [
      { name: "Silent One", email: `s1-${randomUUID()}@example.test`, gender: "woman" },
      { name: "Silent Two", email: `s2-${randomUUID()}@example.test`, gender: "woman" },
    ]);
    for (const r of silentRecs) await recordAnswer(r.token, { endorseOnly: true });
    assert.equal((await acceptIfRecommended(silent.id)).accepted, true);
    const silentPerson = await prisma.person.findUniqueOrThrow({ where: { id: silent.id } });
    assert.equal(
      silentPerson.recommendation,
      null,
      "Two taps accept an applicant and leave the profile quote empty rather than inventing one.",
    );

    // An unknown token, and a request whose applicant walked away.
    assert.equal((await recordAnswer("not-a-real-token", { endorseOnly: true })).ok, false);
    await prisma.person.update({ where: { id: silent.id }, data: { status: "exited" } });
    const closed = await recordAnswer(silentRecs[0].token, { body: "x".repeat(50) });
    assert.equal(closed.ok, false, "A declined applicant's links stop accepting answers.");

    // --- a recommendation written for someone already let in by hand --------
    // The case that actually happened: an operator approves an applicant, and
    // twenty minutes later a friend writes six sentences about them. Copying
    // the quote only on the way in meant those words reached nothing.
    const already = await makeApplicant("woman");
    created.push(already.id);
    const [lateRec] = await saveRecommenders(already.id, [
      { name: "Late Writer", email: `late-${randomUUID()}@example.test`, gender: "man" },
    ]);
    await prisma.person.update({
      where: { id: already.id },
      data: { status: "active", acceptedAt: new Date(), acceptOverrideReason: "approved by hand" },
    });
    await recordAnswer(lateRec.token, {
      body: "She is the person everyone calls first, and this was written after she was already in.",
    });
    await acceptIfRecommended(already.id);
    await syncLeadRecommendation(already.id);
    const synced = await prisma.person.findUniqueOrThrow({ where: { id: already.id } });
    assert.match(
      synced.recommendation ?? "",
      /already in/,
      "A recommendation written for an existing member must still reach the profile.",
    );
    assert.equal(synced.voucherName, "Late Writer");

    // And it never overwrites what is already there.
    await prisma.recommendation.updateMany({
      where: { applicantId: already.id },
      data: { body: "A second set of words that must not replace the first." },
    });
    await syncLeadRecommendation(already.id);
    assert.match(
      (await prisma.person.findUniqueOrThrow({ where: { id: already.id } })).recommendation ?? "",
      /already in/,
      "The first friend to write owns the quote.",
    );

    console.log(
      "recommendation gate passed: any two friends accept an applicant, one-tap vouches count without inventing a quote, words upgrade a tap, acceptance fires once under concurrency, requests survive an edit, a declined applicant is never revived, and a friend who says no counts toward nothing",
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
