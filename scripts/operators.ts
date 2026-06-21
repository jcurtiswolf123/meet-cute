// Operator (admin) account management from the CLI. Operators sign in with the
// normal magic-link flow; this just sets/lists the isOperator flag.
//
//   npx tsx scripts/operators.ts list
//   npx tsx scripts/operators.ts add <email> [Full Name] [NYC|SF]
//   npx tsx scripts/operators.ts remove <email>
//
// Runs against whatever DATABASE_URL points at (Neon in prod). Idempotent.
import { prisma } from "../src/lib/prisma";

function normalizeEmail(e: string) {
  return e.trim().toLowerCase();
}

async function list() {
  const ops = await prisma.person.findMany({
    where: { isOperator: true },
    orderBy: { name: "asc" },
    select: { name: true, email: true, city: true, status: true },
  });
  if (ops.length === 0) {
    console.log("No operators. Add one: npx tsx scripts/operators.ts add <email>");
    return;
  }
  console.log(`${ops.length} operator(s):`);
  for (const o of ops) console.log(`  - ${o.name} <${o.email}> · ${o.city} · ${o.status}`);
}

async function add(emailRaw: string, name?: string, cityRaw?: string) {
  const email = normalizeEmail(emailRaw);
  if (!email.includes("@")) throw new Error(`Invalid email: ${emailRaw}`);
  const city = (cityRaw || "").toUpperCase() === "SF" ? "SF" : "NYC";

  const existing = await prisma.person.findUnique({ where: { email } });
  if (existing) {
    await prisma.person.update({ where: { id: existing.id }, data: { isOperator: true, status: "active" } });
    console.log(`Promoted existing account to operator: ${email}`);
  } else {
    const local = email.split("@")[0].replace(/[._-]+/g, " ").trim();
    const fallback = local ? local.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60) : "Operator";
    await prisma.person.create({
      data: { email, name: name?.slice(0, 60) || fallback, city, isOperator: true, status: "active", headline: "Matchmaker" },
    });
    console.log(`Created operator: ${email} (${city})`);
  }
  console.log(`They can sign in at /login with this email.`);
}

async function remove(emailRaw: string) {
  const email = normalizeEmail(emailRaw);
  const person = await prisma.person.findUnique({ where: { email } });
  if (!person || !person.isOperator) throw new Error(`Not an operator: ${email}`);
  const count = await prisma.person.count({ where: { isOperator: true } });
  if (count <= 1) throw new Error("Refusing to remove the last operator (lockout).");
  await prisma.person.update({ where: { id: person.id }, data: { isOperator: false } });
  console.log(`Revoked operator access: ${email} (account kept)`);
}

(async () => {
  const [cmd, ...args] = process.argv.slice(2);
  try {
    if (cmd === "list" || !cmd) await list();
    else if (cmd === "add") await add(args[0], args[1], args[2]);
    else if (cmd === "remove") await remove(args[0]);
    else {
      console.error(`Unknown command: ${cmd}`);
      console.error("Usage: list | add <email> [name] [NYC|SF] | remove <email>");
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("Error:", (e as Error).message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
