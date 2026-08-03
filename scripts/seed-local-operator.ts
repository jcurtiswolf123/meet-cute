import { prisma } from "../src/lib/prisma";

async function main() {
  const jess = await prisma.person.upsert({
    where: { email: "jesswolflord@gmail.com" },
    update: { isOperator: true, isSuperAdmin: true, status: "active" },
    create: {
      name: "Jess Wolf Lord",
      email: "jesswolflord@gmail.com",
      city: "NYC",
      status: "active",
      isOperator: true,
      isSuperAdmin: true,
    },
  });
  console.log(`seeded local operator ${jess.email} (${jess.id})`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
