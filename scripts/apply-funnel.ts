// What the application is actually doing, read from the live roster.
//
//   npx tsx scripts/apply-funnel.ts
//   npx tsx scripts/apply-funnel.ts --since 2026-08-01
//
// Read-only. Written to answer one question that kept being argued from
// impressions: is the six-step application better or worse than the one page it
// replaced. Impressions are a bad instrument here because the stepper shipped
// mid-morning, so both forms ran on the same day, against the same traffic, and
// the only honest comparison is by the hour each person arrived.
//
// It also checks the three things that have to be true whatever the form looks
// like: an applicant is emailed when they finish, their two friends are asked,
// and the row records what happened.
import { prisma } from "../src/lib/prisma";

/** The deploy that replaced the one-page form with six steps. */
const STEPPER_LIVE = new Date("2026-08-04T15:26:02Z");

const sinceArg = process.argv.indexOf("--since");
const since = sinceArg > -1 ? new Date(`${process.argv[sinceArg + 1]}T00:00:00Z`) : new Date("2026-07-25T00:00:00Z");

function pct(part: number, whole: number): string {
  if (!whole) return "n/a";
  return `${Math.round((part / whole) * 100)}%`;
}

function line(label: string, value: string | number): void {
  console.log(`  ${label.padEnd(46)} ${value}`);
}

async function main() {
  const host = new URL(process.env.DATABASE_URL || "postgres://none/").hostname;
  console.log(`database: ${host}`);
  console.log(`since:    ${since.toISOString().slice(0, 10)}\n`);

  const people = await prisma.person.findMany({
    where: { createdAt: { gte: since } },
    select: {
      id: true, name: true, email: true, status: true, city: true, gender: true,
      createdAt: true, basicsAt: true, appliedAt: true, applicationStep: true,
      acceptedById: true, acceptOverrideReason: true, unfinishedNudgedAt: true,
      photos: { select: { id: true }, where: { status: "approved" } },
      recommendationsReceived: {
        select: { id: true, name: true, email: true, status: true, requestedAt: true, remindedAt: true, body: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Someone who only ever signed in is not an applicant, they are a visitor who
  // got as far as an inbox. Counting them as applicants is what made the old
  // completion rate look fine.
  const started = people.filter((p) => p.basicsAt || p.appliedAt || p.applicationStep || p.photos.length);
  const finished = people.filter((p) => p.appliedAt);

  console.log("EVERYONE WHO SIGNED IN");
  line("signed in", people.length);
  line("got as far as answering something", `${started.length} (${pct(started.length, people.length)})`);
  line("finished, meaning two friends were named", `${finished.length} (${pct(finished.length, people.length)})`);

  // The comparison. Bucket on when the person first appeared, not on when they
  // finished: someone who signed in under the old form and came back after the
  // deploy saw both, and belongs in neither bucket cleanly. There are few of
  // them, and they are called out rather than silently assigned.
  const old = people.filter((p) => p.createdAt < STEPPER_LIVE);
  const neu = people.filter((p) => p.createdAt >= STEPPER_LIVE);
  const straddlers = old.filter((p) => p.appliedAt && p.appliedAt >= STEPPER_LIVE);

  console.log("\nONE PAGE versus SIX STEPS (bucketed on when they first signed in)");
  for (const [label, group] of [["one page ", old], ["six steps", neu]] as const) {
    const done = group.filter((p) => p.appliedAt).length;
    const touched = group.filter((p) => p.basicsAt || p.applicationStep || p.photos.length).length;
    line(
      `${label}: signed in ${String(group.length).padStart(3)}`,
      `answered something ${String(touched).padStart(3)} (${pct(touched, group.length).padStart(4)})   finished ${String(done).padStart(3)} (${pct(done, group.length).padStart(4)})`,
    );
  }
  if (straddlers.length) {
    console.log(`  note: ${straddlers.length} signed in under the one page and finished after the stepper shipped.`);
    console.log("        They are counted in the one-page row above, which understates the stepper.");
  }

  // Where the unfinished ones stopped. The whole argument for the stepper is
  // that stopping leaves something behind, so this is the number that says
  // whether it does.
  const stuck = people.filter((p) => !p.appliedAt && (p.applicationStep || p.photos.length || p.basicsAt));
  console.log("\nWHERE THE UNFINISHED ONES STOPPED");
  if (!stuck.length) console.log("  nobody is mid-application");
  const byStep = new Map<string, number>();
  for (const p of stuck) byStep.set(p.applicationStep ?? "signed in only", (byStep.get(p.applicationStep ?? "signed in only") ?? 0) + 1);
  for (const [step, count] of [...byStep].sort((a, b) => b[1] - a[1])) line(`last answered: ${step}`, count);
  const withSomething = stuck.filter((p) => p.name && p.city && p.applicationStep);
  line("of those, we now know name and city", `${withSomething.length} (was zero under the one page)`);

  // The three things that must be true regardless of the form.
  console.log("\nDID THE MACHINERY RUN (everyone who finished)");
  const ids = finished.map((p) => p.id);
  const confirmations = await prisma.deliveryJob.findMany({
    where: { kind: "application_received", personId: { in: ids } },
    select: { personId: true, status: true, providerMessageId: true, lastError: true },
  });
  const confirmed = new Set(confirmations.filter((j) => j.status === "sent").map((j) => j.personId));
  line("emailed a confirmation after applying", `${confirmed.size} of ${finished.length}`);

  const asks = finished.flatMap((p) => p.recommendationsReceived);
  const asked = asks.filter((r) => r.requestedAt).length;
  line("recommendation asks created", asks.length);
  line("of those, actually sent", `${asked} (${pct(asked, asks.length)})`);
  const answered = asks.filter((r) => r.status === "endorsed" || r.status === "submitted");
  line("friends who answered", `${answered.length} (${pct(answered.length, asks.length)})`);
  line("of those, who wrote words", answered.filter((r) => r.body).length);
  line("nudged because they went quiet", asks.filter((r) => r.remindedAt).length);

  const accepted = finished.filter((p) => p.status !== "applicant");
  line("applicants accepted", `${accepted.length} of ${finished.length}`);
  // Attribution is only readable for people who applied after the gate existed.
  // acceptedById and acceptOverrideReason are both null on every older row, and
  // reading "no override recorded" as "accepted by their friends" credited the
  // gate with every hand approval that predated it.
  const attributable = accepted.filter((p) => p.recommendationsReceived.length > 0);
  line("of those, applied through the gate at all", attributable.length);
  line("  accepted by two friends", attributable.filter((p) => !p.acceptedById).length);
  line("  accepted early by an operator", attributable.filter((p) => p.acceptedById).length);
  line("pre-gate, so not attributable either way", accepted.length - attributable.length);

  const failures = confirmations.filter((j) => j.status === "failed");
  const missing = finished.filter((p) => !confirmed.has(p.id));
  if (failures.length) console.log(`\n  FAILED confirmations: ${failures.map((f) => f.lastError).join("; ")}`);
  if (missing.length) {
    console.log("\n  finished but no confirmation email recorded:");
    for (const p of missing) console.log(`    ${p.name} <${p.email}> applied ${p.appliedAt?.toISOString()}`);
  }

  // The traffic the comparison above is drawn from, by hour. At this volume the
  // rate is a story about three or four people, and printing it without the
  // arrivals invites reading noise as a trend.
  console.log("\nARRIVALS BY DAY (and by hour once the stepper shipped)");
  const byDay = new Map<string, number>();
  for (const p of people) {
    const key = p.createdAt < STEPPER_LIVE
      ? p.createdAt.toISOString().slice(0, 10)
      : `${p.createdAt.toISOString().slice(0, 13)}:00 UTC (six steps)`;
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  for (const [day, count] of byDay) line(day, count);
  const hoursLive = (Date.now() - STEPPER_LIVE.getTime()) / 3_600_000;
  line("hours the six-step form has been live", hoursLive.toFixed(1));
  line("people who have seen it", neu.length);

  // Anyone who finished on the stepper, named individually. At this volume the
  // rate is less use than the list.
  const onStepper = finished.filter((p) => p.createdAt >= STEPPER_LIVE);
  if (onStepper.length) {
    console.log("\nFINISHED ON THE SIX-STEP FORM");
    for (const p of onStepper) {
      const answers = p.recommendationsReceived.filter((r) => r.status === "endorsed" || r.status === "submitted").length;
      console.log(
        `  ${p.name} <${p.email}> ${p.city} ${p.gender ?? "?"} photos=${p.photos.length} friends=${answers}/${p.recommendationsReceived.length} status=${p.status}`,
      );
    }
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
