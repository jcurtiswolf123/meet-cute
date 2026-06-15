// End-to-end demo of the concierge bot with fast-forwarded time.
// Exercises: propose -> overlap -> confirm -> .ics -> morning-of -> post-date,
// plus the no-overlap -> round 2 path and the quiet -> nudge -> handoff path.
import { prisma } from "../src/lib/prisma";
import { startThread, recordPick, tick, icsForThread } from "../src/lib/concierge";

async function transcript(matchId: string, label: string) {
  const t = await prisma.conciergeThread.findUnique({
    where: { matchId },
    include: { messages: { orderBy: { createdAt: "asc" } }, match: { include: { personA: true, personB: true } } },
  });
  if (!t) return console.log(`(${label}: no thread)`);
  console.log(`\n===== ${label} | state=${t.state} round=${t.round} =====`);
  for (const m of t.messages) {
    const who = m.direction === "in" ? `  <- member` : `BOT ->`;
    console.log(`${who} ${m.body.replace(/\n/g, " ")}`);
  }
}

(async () => {
  // --- Flow A: Maya + Ben, clean overlap ---
  const maya = await prisma.person.findFirstOrThrow({ where: { email: "maya@example.com" } });
  const ben = await prisma.person.findFirstOrThrow({ where: { email: "ben@example.com" } });
  const mAB = await prisma.match.findFirstOrThrow({
    where: { personAId: maya.id, personBId: ben.id },
  });

  const now = new Date();
  const thread = await startThread(mAB.id, now);
  const slots: string[] = JSON.parse(thread!.proposedSlots ?? "[]");
  await recordPick(thread!.id, maya.id, slots[1]);
  await recordPick(thread!.id, ben.id, slots[1]); // same slot -> confirm
  await transcript(mAB.id, "FLOW A: Maya + Ben (overlap -> confirm)");

  const confirmed = await prisma.conciergeThread.findUniqueOrThrow({
    where: { matchId: mAB.id },
    include: { venue: true },
  });
  console.log("\n.ics generated:\n" + icsForThread({
    confirmedSlot: confirmed.confirmedSlot!,
    id: confirmed.id,
    venueName: confirmed.venue!.name,
    withName: "Ben",
  }));

  // morning-of: jump to the date
  await tick(new Date(confirmed.confirmedSlot!.getTime() - 8 * 3600 * 1000));
  // post-date: 25h after
  await tick(new Date(confirmed.confirmedSlot!.getTime() + 25 * 3600 * 1000));
  await transcript(mAB.id, "FLOW A after morning-of + post-date ticks");

  // --- Flow B: no overlap -> round 2 ---
  const elena = await prisma.person.findFirstOrThrow({ where: { email: "elena@example.com" } });
  const raj = await prisma.person.findFirstOrThrow({ where: { email: "raj@example.com" } });
  const mER = await prisma.match.findFirstOrThrow({ where: { personAId: elena.id, personBId: raj.id } });
  await prisma.match.update({ where: { id: mER.id }, data: { stage: "mutual_yes", aDecision: "yes", bDecision: "yes" } });
  const tER = await startThread(mER.id, now);
  const sER: string[] = JSON.parse(tER!.proposedSlots ?? "[]");
  await recordPick(tER!.id, elena.id, sER[0]);
  await recordPick(tER!.id, raj.id, sER[2]); // different -> round 2
  await transcript(mER.id, "FLOW B: Elena + Raj (no overlap -> round 2)");

  // --- Flow C: someone goes quiet -> nudge -> handoff ---
  const jordan = await prisma.person.findFirstOrThrow({ where: { email: "jordan@example.com" } });
  const tom = await prisma.person.findFirstOrThrow({ where: { email: "tom@example.com" } });
  // make a fresh match for the demo
  const mJT = await prisma.match.create({
    data: { personAId: jordan.id, personBId: tom.id, stage: "mutual_yes", aDecision: "yes", bDecision: "yes" },
  });
  const tJT = await startThread(mJT.id, now);
  // nobody picks. Tick past the 48h hold -> nudge. Then past +24h -> handoff.
  await tick(new Date(now.getTime() + 49 * 3600 * 1000));
  await tick(new Date(now.getTime() + (49 + 25) * 3600 * 1000));
  await transcript(mJT.id, "FLOW C: Jordan + Tom (quiet -> nudge -> handoff)");
  // cleanup the demo-only match
  await prisma.conciergeMessage.deleteMany({ where: { threadId: tJT!.id } });
  await prisma.conciergeThread.delete({ where: { id: tJT!.id } });
  await prisma.match.delete({ where: { id: mJT.id } });

  await prisma.$disconnect();
})();
