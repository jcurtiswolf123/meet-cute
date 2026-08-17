// Which queued nudges a friend's answer withdraws, and which ones it must leave
// alone.
//
// The three recommendation nudges ride the outbox: queued the moment the ask is,
// due in two, five and ten days, withdrawn when the friend answers. Withdrawal
// used to key on kind plus recipient address, which is one address for every ask
// that friend has ever been named in. On production, one person named by five
// applicants answered for one of them and took twelve nudges for the other four
// down with it, cancelled and never sent, so four applicants sat waiting on a
// friend who was never chased again.
//
// The cases below are the ones that were silently wrong: one address with two
// asks outstanding, and acceptance arriving by a route that never touches a
// recommendation at all.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import {
  cancelRecommendationReminders,
  cancelRemindersForApplicant,
  queueEmailDelivery,
  recommendationReminderKeys,
} from "../src/lib/delivery";
import { REMINDER_SCHEDULE_MS, saveRecommenders } from "../src/lib/recommendations";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("The reminder withdrawal checks require an isolated local database.");
}

async function makeApplicant() {
  return prisma.person.create({
    data: {
      name: `Nudge Applicant ${randomUUID().slice(0, 8)}`,
      email: `nudge-${randomUUID()}@example.test`,
      city: "NYC",
      status: "applicant",
      appliedAt: new Date(),
    },
  });
}

/** Queue the three nudges the way `saveRecommenders`' caller does. */
async function queueNudges(token: string, recipient: string) {
  const keys = recommendationReminderKeys(token);
  assert.equal(keys.length, REMINDER_SCHEDULE_MS.length, "One key per scheduled nudge.");
  for (const [index, delay] of REMINDER_SCHEDULE_MS.entries()) {
    await queueEmailDelivery({
      kind: "recommendation_reminder",
      to: recipient,
      subject: "A nudge",
      html: "<p>A nudge</p>",
      text: "A nudge",
      idempotencyKey: keys[index],
      availableAt: new Date(Date.now() + delay),
    });
  }
}

async function pendingFor(token: string): Promise<number> {
  return prisma.deliveryJob.count({
    where: { idempotencyKey: { in: recommendationReminderKeys(token) }, status: "pending" },
  });
}

async function main() {
  const created: string[] = [];
  // One friend, named by two different applicants. This is the whole defect.
  const friend = `hub-${randomUUID()}@example.test`;

  try {
    const [first, second] = await Promise.all([makeApplicant(), makeApplicant()]);
    created.push(first.id, second.id);

    const [askedByFirst] = await saveRecommenders(first.id, [
      { name: "Hub Friend", email: friend, gender: "woman" },
      { name: "Other Friend", email: `other-${randomUUID()}@example.test`, gender: "man" },
    ]);
    const [askedBySecond] = await saveRecommenders(second.id, [
      { name: "Hub Friend", email: friend, gender: "woman" },
      { name: "Another Friend", email: `another-${randomUUID()}@example.test`, gender: "man" },
    ]);
    assert.notEqual(askedByFirst.token, askedBySecond.token, "Each ask is its own capability.");

    await queueNudges(askedByFirst.token, friend);
    await queueNudges(askedBySecond.token, friend);
    assert.equal(await pendingFor(askedByFirst.token), 3);
    assert.equal(await pendingFor(askedBySecond.token), 3);

    // --- answering one ask withdraws that ask, and only that ask -------------
    const withdrawn = await cancelRecommendationReminders(askedByFirst.token);
    assert.equal(withdrawn, 3, "All three nudges for the answered ask are withdrawn at once.");
    assert.equal(await pendingFor(askedByFirst.token), 0);
    assert.equal(
      await pendingFor(askedBySecond.token),
      3,
      "The other applicant's nudges to the same address must survive: that friend has not answered for them.",
    );

    // Withdrawal is by job, so it can never reach mail addressed elsewhere.
    const sameAddressOther = await prisma.deliveryJob.count({
      where: { recipient: friend, status: "cancelled" },
    });
    assert.equal(sameAddressOther, 3, "Exactly the three answered-ask nudges are cancelled.");

    // Idempotent: answering twice (page, then a reply landing later) is a no-op.
    assert.equal(await cancelRecommendationReminders(askedByFirst.token), 0);

    // --- acceptance withdraws everything still queued for that applicant ----
    // This is the operator-approval and nomination route: nobody answered, so no
    // token-scoped cancel ever fires, and the nudges used to stay queued against
    // somebody who was already a member. One live member had two chase emails
    // scheduled for a week after she was accepted.
    await prisma.person.update({
      where: { id: second.id },
      data: { status: "active", acceptedAt: new Date() },
    });
    const clearedForApplicant = await cancelRemindersForApplicant(second.id);
    assert.equal(clearedForApplicant, 3, "Every nudge still queued for the accepted applicant goes.");
    assert.equal(await pendingFor(askedBySecond.token), 0);

    // And it stays scoped to that applicant: the first applicant's OTHER friend
    // was never queued here, so nothing outside these two asks was touched.
    const strays = await prisma.deliveryJob.count({
      where: { kind: "recommendation_reminder", status: "pending", recipient: friend },
    });
    assert.equal(strays, 0);

    console.log(
      "reminder withdrawal passed: an answer withdraws its own ask's three nudges and leaves another applicant's nudges to the same friend queued, withdrawal is idempotent, and acceptance by any route clears everything still scheduled for that applicant",
    );
  } finally {
    await prisma.deliveryJob.deleteMany({ where: { recipient: friend } });
    await prisma.person.deleteMany({ where: { id: { in: created } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
