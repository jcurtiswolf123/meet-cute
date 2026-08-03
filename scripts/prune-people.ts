// Remove seed and rehearsal Person rows from a live roster, safely.
//
//   npx tsx scripts/prune-people.ts <email-or-id> [...]            # dry run
//   npx tsx scripts/prune-people.ts <email-or-id> [...] --apply    # delete
//   npx tsx scripts/prune-people.ts --phone +1646... --apply       # phone-only rows
//
// Why this exists rather than a hand-written delete: Match.personAId and
// Match.personBId are ON DELETE RESTRICT, so deleting a person who appears in
// any match fails with a foreign key error partway through. Matches have to go
// first, and deleting a match cascades its invites, delivery jobs, intro
// messages and notes. Vouch, Note.subjectId, Referral and CoachingEngagement are
// also RESTRICT and are reported rather than silently removed.
//
// Always writes a full JSON backup of every row it is about to destroy before
// touching anything, and refuses to run against an operator account.
import { writeFileSync } from "fs";
import { prisma } from "../src/lib/prisma";

type Target = { id: string; name: string; email: string | null; phone: string | null; isOperator: boolean };

function usage(): never {
  console.error("Usage: prune-people.ts <email|id|--phone +1...> [...] [--apply] [--backup <path>]");
  process.exit(1);
}

(async () => {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const backupIdx = argv.indexOf("--backup");
  const backupPath =
    backupIdx >= 0 ? argv[backupIdx + 1] : `prune-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

  const selectors: { email?: string; id?: string; phone?: string }[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") continue;
    if (a === "--backup") { i++; continue; }
    if (a === "--phone") { const v = argv[++i]; if (!v) usage(); selectors.push({ phone: v }); continue; }
    if (a.startsWith("--")) usage();
    if (a.includes("@")) selectors.push({ email: a.trim().toLowerCase() });
    else selectors.push({ id: a });
  }
  if (selectors.length === 0) usage();

  const targets: Target[] = [];
  for (const s of selectors) {
    const found = await prisma.person.findMany({
      where: s.email ? { email: s.email } : s.id ? { id: s.id } : { phone: s.phone },
      select: { id: true, name: true, email: true, phone: true, isOperator: true },
    });
    if (found.length === 0) {
      console.error(`NOT FOUND: ${JSON.stringify(s)}`);
      process.exit(1);
    }
    for (const f of found) if (!targets.some((t) => t.id === f.id)) targets.push(f);
  }

  // An operator row is never seed data, and removing one silently revokes studio
  // access. Use scripts/operators.ts remove for that, deliberately.
  const operators = targets.filter((t) => t.isOperator);
  if (operators.length > 0) {
    console.error("REFUSING: these are operator accounts. Use scripts/operators.ts remove first.");
    for (const o of operators) console.error(`  ${o.name} <${o.email}>`);
    process.exit(1);
  }

  const ids = targets.map((t) => t.id);
  const matches = await prisma.match.findMany({
    where: { OR: [{ personAId: { in: ids } }, { personBId: { in: ids } }] },
    include: {
      personA: { select: { id: true, name: true, email: true } },
      personB: { select: { id: true, name: true, email: true } },
      invites: true,
      deliveryJobs: true,
      introMessages: true,
      notes: true,
    },
  });

  // A match where only ONE side is being pruned belongs to somebody who is
  // staying. Deleting it removes their invite token and their delivery history,
  // so it is called out by name rather than folded into a count.
  const survivorImpact = matches
    .map((m) => {
      const goingA = ids.includes(m.personAId);
      const goingB = ids.includes(m.personBId);
      if (goingA && goingB) return null;
      const survivor = goingA ? m.personB : m.personA;
      return { survivor, stage: m.stage, matchId: m.id };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // RESTRICT relations this script does not delete. Anything here has to be
  // resolved by hand, so stop rather than fail halfway through a transaction.
  const blockers: string[] = [];
  for (const t of targets) {
    const [vouches, notesAbout, referrals, coachingClient, coachingCoach] = await Promise.all([
      prisma.vouch.count({ where: { OR: [{ subjectId: t.id }, { voucherId: t.id }] } }),
      prisma.note.count({ where: { subjectId: t.id } }),
      prisma.referral.count({ where: { inviterId: t.id } }),
      prisma.coachingEngagement.count({ where: { clientId: t.id } }),
      prisma.coachingEngagement.count({ where: { coachId: t.id } }),
    ]);
    const held = [
      vouches && `${vouches} vouch`,
      notesAbout && `${notesAbout} note`,
      referrals && `${referrals} referral`,
      coachingClient + coachingCoach && `${coachingClient + coachingCoach} coaching`,
    ].filter(Boolean);
    if (held.length) blockers.push(`${t.name} <${t.email ?? t.phone}> holds ${held.join(", ")}`);
  }

  console.log(`${apply ? "APPLY" : "DRY RUN"} - ${targets.length} people, ${matches.length} matches`);
  console.log("\nPeople:");
  for (const t of targets) console.log(`  - ${t.name} <${t.email ?? t.phone ?? "no contact"}>  ${t.id}`);
  console.log("\nMatches deleted (with their invites, delivery jobs, messages, notes):");
  for (const m of matches) {
    console.log(
      `  - ${m.stage.padEnd(10)} ${m.personA.name} <-> ${m.personB.name}` +
        `  invites=${m.invites.length} jobs=${m.deliveryJobs.length} msgs=${m.introMessages.length}`,
    );
  }
  if (survivorImpact.length) {
    console.log("\nWARNING - these people are NOT being pruned but lose a match:");
    for (const s of survivorImpact) console.log(`  - ${s.survivor.name} <${s.survivor.email ?? "-"}> loses a ${s.stage} match`);
  }
  if (blockers.length) {
    console.log("\nBLOCKED - restrict-protected rows must be cleared by hand:");
    for (const b of blockers) console.log(`  - ${b}`);
    process.exit(1);
  }

  const backup = {
    takenAt: new Date().toISOString(),
    database: (process.env.DATABASE_URL || "").replace(/\/\/[^@]*@/, "//***:***@"),
    people: await prisma.person.findMany({
      where: { id: { in: ids } },
      include: { photos: { include: { asset: true } }, prompts: true, sessions: false },
    }),
    matches,
  };
  writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`\nBackup written: ${backupPath} (${targets.length} people, ${matches.length} matches)`);

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to delete.");
    await prisma.$disconnect();
    return;
  }

  // Matches first (RESTRICT), then the people. One transaction so a failure
  // anywhere leaves the roster exactly as it was.
  const result = await prisma.$transaction(async (tx) => {
    const m = await tx.match.deleteMany({ where: { id: { in: matches.map((x) => x.id) } } });
    const p = await tx.person.deleteMany({ where: { id: { in: ids } } });
    return { matches: m.count, people: p.count };
  });
  console.log(`\nDeleted ${result.people} people and ${result.matches} matches.`);

  const remaining = await prisma.person.findMany({
    orderBy: { name: "asc" },
    select: { name: true, email: true, status: true, isOperator: true },
  });
  console.log(`\nRoster now (${remaining.length}):`);
  for (const r of remaining) console.log(`  ${r.name} <${r.email ?? "-"}> ${r.status}${r.isOperator ? " OPERATOR" : ""}`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("Error:", (e as Error).message);
  await prisma.$disconnect();
  process.exitCode = 1;
});
