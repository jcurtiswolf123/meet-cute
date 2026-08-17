// Withdraw recommendation nudges still queued for somebody who is no longer an
// applicant.
//
// The withdrawal used to fire only when a friend answered, so acceptance by any
// other route (an operator approving early, two nominations carrying words) left
// the nudges queued. `cancelRemindersForApplicant` closes that from now on; this
// clears what was already in the outbox when it shipped.
//
// It only ever moves pending to cancelled, so the worst case is mail that does
// not go out. Prints its target host first, per the repo convention.

import { prisma } from "../src/lib/prisma";
import { cancelRemindersForApplicant } from "../src/lib/delivery";

const mask = (address: string) => address.replace(/(.{2})[^@]*(@.*)/, "$1***$2");

async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  console.log(`database: ${url.hostname}${url.pathname}`);

  const queued = await prisma.deliveryJob.findMany({
    where: { status: "pending", kind: "recommendation_reminder" },
    select: { recipient: true },
  });
  const recipients = [...new Set(queued.map((job) => job.recipient))];
  const asks = await prisma.recommendation.findMany({
    where: { email: { in: recipients } },
    select: { applicantId: true, applicant: { select: { name: true, status: true } } },
  });
  const settled = [
    ...new Map(
      asks.filter((ask) => ask.applicant.status !== "applicant").map((ask) => [ask.applicantId, ask]),
    ).values(),
  ];

  console.log(`applicants with queued nudges who are no longer applicants: ${settled.length}`);
  let withdrawn = 0;
  for (const ask of settled) {
    const count = await cancelRemindersForApplicant(ask.applicantId);
    withdrawn += count;
    console.log(`  ${ask.applicant.name} [${ask.applicant.status}]: ${count} nudge(s) withdrawn`);
  }

  const left = await prisma.deliveryJob.findMany({
    where: { status: "pending" },
    select: { kind: true, recipient: true, availableAt: true },
    orderBy: { availableAt: "asc" },
  });
  console.log(`withdrawn: ${withdrawn} | still scheduled: ${left.length}`);
  for (const job of left) {
    console.log(`  due ${job.availableAt.toISOString()} ${job.kind} ${mask(job.recipient)}`);
  }
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
