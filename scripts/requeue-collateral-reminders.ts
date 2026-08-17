// Re-queue the nudges that were cancelled by somebody else's answer.
//
// Withdrawal keyed on kind plus recipient until 2026-08-17, so a friend named by
// several applicants took every applicant's nudges down when they answered for
// one of them. Twelve nudges went that way on production, all to one address, and
// four applicants were left waiting on a friend who was never chased again.
//
// Dry run by default: it prints one nudge per open ask and sends nothing. Pass
// `--write` to queue them. Deliberately one nudge per ask rather than replaying
// all three, spaced a day apart, because the whole point is that this address
// gets several asks about several different people and four emails at once is how
// an address stops opening any of them.
//
//   node --import tsx scripts/requeue-collateral-reminders.ts            # dry run
//   node --import tsx scripts/requeue-collateral-reminders.ts --write

import { prisma } from "../src/lib/prisma";
import { queueEmailDelivery, makeDeliveryKey, recommendationReminderKeys } from "../src/lib/delivery";
import { recommendationRequestEmail } from "../src/lib/email";
import { recommendationUrl, recommendationReplyTo } from "../src/lib/recommendations";

const write = process.argv.includes("--write");
const FIRST_DUE_HOURS = 14;
const SPACING_HOURS = 24;

async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  console.log(`database: ${url.hostname}${url.pathname} (${write ? "WRITING" : "dry run"})`);

  // Addresses that had a nudge cancelled and still have an unanswered ask.
  const cancelled = await prisma.deliveryJob.findMany({
    where: { status: "cancelled", kind: "recommendation_reminder" },
    select: { recipient: true },
  });
  const recipients = [...new Set(cancelled.map((job) => job.recipient))];

  const open = await prisma.recommendation.findMany({
    where: { email: { in: recipients }, status: "requested" },
    select: {
      id: true,
      token: true,
      name: true,
      email: true,
      applicantNote: true,
      applicant: { select: { id: true, name: true, city: true, status: true } },
    },
    orderBy: { requestedAt: "asc" },
  });

  // Only asks with nothing already scheduled, and only for live applicants.
  // Scheduled is asked per ASK, not per address: one address can hold several
  // asks, which is the whole reason this repair exists. Counting by recipient
  // here would skip exactly the asks that were wrongly cancelled, because a
  // later ask to the same friend still has its own nudges queued.
  const candidates = [];
  for (const ask of open) {
    if (ask.applicant.status !== "applicant") continue;
    const scheduled = await prisma.deliveryJob.count({
      where: {
        status: "pending",
        idempotencyKey: { in: recommendationReminderKeys(ask.token) },
      },
    });
    if (scheduled > 0) continue;
    candidates.push(ask);
  }

  console.log(`asks with no nudge left scheduled: ${candidates.length}`);
  for (const [index, ask] of candidates.entries()) {
    const due = new Date(Date.now() + (FIRST_DUE_HOURS + index * SPACING_HOURS) * 3600_000);
    console.log(`  ${ask.email} about ${ask.applicant.name} -> due ${due.toISOString()}`);
    if (!write) continue;
    const msg = recommendationRequestEmail({
      recommenderName: ask.name,
      applicantName: ask.applicant.name,
      applicantCity: ask.applicant.city,
      link: recommendationUrl(ask.token),
      reminder: true,
      applicantNote: ask.applicantNote,
      replyToVouch: true,
    });
    await queueEmailDelivery({
      kind: "recommendation_reminder",
      to: ask.email,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      replyTo: recommendationReplyTo(ask.token),
      idempotencyKey: makeDeliveryKey("recommendation_reminder", ask.token, "repair20260817"),
      availableAt: due,
    });
  }
  if (!write) console.log("nothing queued. pass --write to queue these.");
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
