import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const ms = await prisma.match.findMany({
    orderBy: { updatedAt: "desc" },
    include: { personA: { select: { name: true, email: true } }, personB: { select: { name: true, email: true } }, invites: { select: { personId: true, sentAt: true, decidedAt: true, createdAt: true } } },
  });
  for (const m of ms) {
    console.log(`${m.id} ${m.stage} A=${m.personA.name}<${m.personA.email}>:${m.aDecision} B=${m.personB.name}<${m.personB.email}>:${m.bDecision} updated=${m.updatedAt.toISOString()} invites=${m.invites.length}`);
  }
}
main().finally(() => prisma.$disconnect());
