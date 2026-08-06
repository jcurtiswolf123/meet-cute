// Nominations: somebody puts a friend forward before that friend has applied.
//
// The things that can quietly go wrong here all cost somebody their words or
// their place:
//
//   - a repeat submission emails a stranger twice, or overwrites the note
//   - a note becomes a recommendation the nominee never earns credit for
//   - a nomination overwrites a recommendation a friend wrote when asked
//   - converting on every page render credits the same nomination twice
//   - two nominations with real words fail to accept somebody outright
//
// So each of those is asserted directly against the database.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import {
  NOMINATION_NOTE_MIN,
  convertNominationsFor,
  nominationApplyUrl,
  nominationByToken,
  nominationCounts,
  saveNomination,
} from "../src/lib/nominations";
import { acceptIfRecommended, gateState, saveRecommenders } from "../src/lib/recommendations";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("The nomination checks require an isolated local database.");
}

const REAL_NOTE =
  "She is the person everybody calls first, and she has been single for exactly as long as she has been busy.";
const SECOND_NOTE =
  "I have known him for eleven years and he is the most straightforwardly kind person I know.";

function pure() {
  assert.equal(nominationCounts(null), false);
  assert.equal(nominationCounts("great person"), false, "Two words are not a recommendation.");
  assert.equal(nominationCounts("x".repeat(NOMINATION_NOTE_MIN - 1)), false);
  assert.equal(nominationCounts("x".repeat(NOMINATION_NOTE_MIN)), true);
  assert.match(nominationApplyUrl("abc"), /\/apply\?ref=abc$/);
  console.log("  pure: what counts as words, and the link the nominee opens");
}

async function applicant(email: string) {
  return prisma.person.create({
    data: { name: "Nominee Person", email, city: "NYC", gender: "woman", status: "applicant" },
  });
}

async function main() {
  pure();
  const people: string[] = [];
  const emails: string[] = [];

  try {
    // --- a nomination with words becomes a recommendation on apply ----------
    const nomineeEmail = `nominee-${randomUUID()}@example.test`;
    const nominatorEmail = `nominator-${randomUUID()}@example.test`;
    emails.push(nomineeEmail, nominatorEmail);

    const first = await saveNomination({
      nominatorName: "Jess Wolf",
      nominatorEmail,
      name: "Ana Nominee",
      email: nomineeEmail,
      note: REAL_NOTE,
    });
    assert.equal(first.isNew, true);
    assert.equal(first.alreadyMember, false);
    assert.equal(first.existingApplicant, false, "Nobody has this address yet.");
    assert.ok(first.nomination.token, "The invite email needs a capability token.");

    const greeted = await nominationByToken(first.nomination.token);
    assert.equal(greeted?.nominatorName, "Jess Wolf", "/apply greets them by who sent them.");
    assert.equal(greeted?.email, nomineeEmail, "And prefills the address it was sent to.");

    // The same pair again is a double-tapped button, not a second referral, and
    // must not produce a second email to a stranger.
    const repeat = await saveNomination({
      nominatorName: "Jess Wolf",
      nominatorEmail,
      name: "Ana Nominee",
      email: nomineeEmail,
      note: "",
    });
    assert.equal(repeat.isNew, false, "A repeat nomination is not new, so nothing is re-sent.");
    assert.equal(repeat.nomination.id, first.nomination.id);
    assert.equal(repeat.nomination.note, REAL_NOTE, "An empty second pass must not blank the words.");
    assert.equal(
      await prisma.nomination.count({ where: { email: nomineeEmail } }),
      1,
      "One row per pair.",
    );

    // They apply. The words they were given become a recommendation that counts.
    const nominee = await applicant(nomineeEmail);
    people.push(nominee.id);
    const credited = await convertNominationsFor({ id: nominee.id, email: nomineeEmail });
    assert.equal(credited, 1, "A nomination with real words is one of the two.");

    const converted = await prisma.recommendation.findUniqueOrThrow({
      where: { applicantId_email: { applicantId: nominee.id, email: nominatorEmail } },
    });
    assert.equal(converted.status, "submitted", "It is answered: nobody has to ask for it again.");
    assert.equal(converted.body, REAL_NOTE);
    assert.equal(converted.name, "Jess Wolf");
    assert.equal(converted.gender, null, "Nobody asked the nominator their gender, so none is invented.");

    const state = await gateState(nominee.id);
    assert.equal(state.qualifying.length, 1);
    assert.equal(state.remaining, 1, "They are asked for one friend rather than two.");

    const stamped = await prisma.nomination.findUniqueOrThrow({ where: { id: first.nomination.id } });
    assert.equal(stamped.status, "applied");
    assert.equal(stamped.personId, nominee.id, "Without this the referral funnel is unmeasurable.");
    assert.ok(stamped.appliedAt);

    // This runs on every render of the friends page as well as on submit.
    assert.equal(
      await convertNominationsFor({ id: nominee.id, email: nomineeEmail }),
      0,
      "Converting twice credits nothing twice.",
    );

    // --- a nomination never overwrites words a friend wrote when asked -------
    const askedEmail = `asked-${randomUUID()}@example.test`;
    const bothEmail = `both-${randomUUID()}@example.test`;
    emails.push(askedEmail, bothEmail);
    const asked = await applicant(askedEmail);
    people.push(asked.id);
    const [request] = await saveRecommenders(asked.id, [
      { name: "Named Friend", email: bothEmail, gender: "woman" },
    ]);
    await prisma.recommendation.update({
      where: { id: request.id },
      data: { status: "submitted", submittedAt: new Date(), body: "The words they wrote when asked." },
    });
    await saveNomination({
      nominatorName: "Named Friend",
      nominatorEmail: bothEmail,
      name: "Asked Person",
      email: askedEmail,
      note: SECOND_NOTE,
    });
    await convertNominationsFor({ id: asked.id, email: askedEmail });
    assert.equal(
      (await prisma.recommendation.findUniqueOrThrow({ where: { id: request.id } })).body,
      "The words they wrote when asked.",
      "The row a friend already owns is never rewritten by a nomination.",
    );

    // --- two nominations with words accept somebody outright ----------------
    const twiceEmail = `twice-${randomUUID()}@example.test`;
    const oneEmail = `one-${randomUUID()}@example.test`;
    const twoEmail = `two-${randomUUID()}@example.test`;
    emails.push(twiceEmail, oneEmail, twoEmail);
    for (const [name, email, note] of [
      ["First Nominator", oneEmail, REAL_NOTE],
      ["Second Nominator", twoEmail, SECOND_NOTE],
    ] as const) {
      await saveNomination({ nominatorName: name, nominatorEmail: email, name: "Twice Named", email: twiceEmail, note });
    }
    const twice = await applicant(twiceEmail);
    people.push(twice.id);
    assert.equal(await convertNominationsFor({ id: twice.id, email: twiceEmail }), 2);
    const outcome = await acceptIfRecommended(twice.id);
    assert.equal(outcome.accepted, true, "Two people who wrote about them is the whole gate.");
    assert.equal(
      (await prisma.person.findUniqueOrThrow({ where: { id: twice.id } })).recommendation,
      REAL_NOTE,
      "The first nomination's words become the profile quote.",
    );

    // --- a nomination with no real words invites and credits nothing --------
    const thinEmail = `thin-${randomUUID()}@example.test`;
    const thinFrom = `thinfrom-${randomUUID()}@example.test`;
    emails.push(thinEmail, thinFrom);
    await saveNomination({
      nominatorName: "Brief Person",
      nominatorEmail: thinFrom,
      name: "Thin Note",
      email: thinEmail,
      note: "great guy",
    });
    const thin = await applicant(thinEmail);
    people.push(thin.id);
    assert.equal(await convertNominationsFor({ id: thin.id, email: thinEmail }), 0);
    assert.equal((await gateState(thin.id)).remaining, 2, "They are asked for both friends.");
    assert.equal(
      (await prisma.nomination.findFirstOrThrow({ where: { email: thinEmail } })).status,
      "applied",
      "It still links, so the referral is measurable even when it credits nothing.",
    );

    // --- somebody already inside is recorded and deliberately not emailed ----
    const memberEmail = `member-${randomUUID()}@example.test`;
    emails.push(memberEmail);
    const member = await prisma.person.create({
      data: { name: "Existing Member", email: memberEmail, city: "NYC", status: "active", acceptedAt: new Date() },
    });
    people.push(member.id);
    const forMember = await saveNomination({
      nominatorName: "Late Friend",
      nominatorEmail: `late-${randomUUID()}@example.test`,
      name: "Existing Member",
      email: memberEmail,
      note: REAL_NOTE,
    });
    assert.equal(forMember.alreadyMember, true);
    assert.equal(
      forMember.nomination.status,
      "skipped",
      "Nobody needs an invitation to a thing they already joined.",
    );

    // --- nominating yourself vouches for nobody -----------------------------
    const selfEmail = `self-${randomUUID()}@example.test`;
    emails.push(selfEmail);
    const selfNom = await saveNomination({
      nominatorName: "Self Starter",
      nominatorEmail: selfEmail,
      name: "Self Starter",
      email: selfEmail,
      note: REAL_NOTE,
    });
    const self = await applicant(selfEmail);
    people.push(self.id);
    assert.equal(
      await convertNominationsFor({ id: self.id, email: selfEmail }),
      0,
      "Nobody vouches for themselves.",
    );
    assert.equal(
      (await prisma.nomination.findUniqueOrThrow({ where: { id: selfNom.nomination.id } })).status,
      "applied",
    );

    console.log(
      "nomination checks passed: one row and one email per pair, words become a recommendation that counts, an asked friend's words are never overwritten, converting is idempotent, two nominations accept outright, thin notes credit nothing, existing members are not emailed, and nobody vouches for themselves",
    );
  } finally {
    await prisma.nomination.deleteMany({
      where: { OR: [{ email: { in: emails } }, { nominatorEmail: { in: emails } }] },
    });
    await prisma.recommendation.deleteMany({ where: { applicantId: { in: people } } });
    await prisma.person.deleteMany({ where: { id: { in: people } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
