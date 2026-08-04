// Chase the applications that were started before anything chased them.
//
// From today the chaser is queued when someone signs in and withdrawn when they
// submit, so this only exists for the people who were already stranded: on
// 3 August, 18 completed an application and 18 signed in and never did. Seven
// of those had uploaded photos first, so they had done the part most people
// find hardest and stopped before the part that takes a minute. Not one of them
// heard from us again.
//
// Dry run by default. It emails people, so the decision to send is a person's.
//
//   node --import tsx scripts/chase-unfinished-applications.ts            # dry run
//   node --import tsx scripts/chase-unfinished-applications.ts --send
//
//   --min-age-hours N   only chase applications older than N hours (default 6,
//                       so nobody is chased while they are still filling it in)

import { prisma } from "../src/lib/prisma";
import { scheduleUnfinishedApplicationNudge } from "../src/lib/actions";

const send = process.argv.includes("--send");
const ageFlag = process.argv.indexOf("--min-age-hours");
const minAgeHours = ageFlag >= 0 ? Number(process.argv[ageFlag + 1]) : 6;

async function main() {
  console.log(`target: ${new URL(process.env.DATABASE_URL!).hostname}`);
  console.log(send ? "MODE: sending" : "MODE: dry run (pass --send to queue)");
  console.log(`only applications older than ${minAgeHours}h\n`);

  const stranded = await prisma.person.findMany({
    where: {
      isOperator: false,
      status: "applicant",
      appliedAt: null,
      unfinishedNudgedAt: null,
      email: { not: null },
      createdAt: { lt: new Date(Date.now() - minAgeHours * 60 * 60 * 1000) },
    },
    select: {
      id: true,
      name: true,
      email: true,
      appliedAt: true,
      basicsAt: true,
      status: true,
      unfinishedNudgedAt: true,
      createdAt: true,
      photos: { select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (stranded.length === 0) {
    console.log("nothing stranded");
    return;
  }

  let queued = 0;
  for (const person of stranded) {
    const age = Math.round((Date.now() - person.createdAt.getTime()) / 3_600_000);
    const line = `${(person.email ?? "").padEnd(34)} ${String(person.photos.length).padStart(2)} photos  ${String(age).padStart(3)}h ago  ${person.basicsAt ? "stopped at the friends" : "stopped at the details"}`;
    if (!send) {
      console.log(`would  ${line}`);
      queued += 1;
      continue;
    }
    // Sent now rather than a day from now: these have been waiting far longer
    // than a day already.
    const ok = await scheduleUnfinishedApplicationNudge(person, { delayMs: 0 });
    console.log(`${ok ? "queue " : "skip  "}${line}`);
    if (ok) queued += 1;
  }

  console.log(`\n${send ? "queued" : "would queue"}: ${queued} of ${stranded.length}`);
  if (!send) console.log("nothing was sent. re-run with --send");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
