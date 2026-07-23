// Operator (admin) account management from the CLI. Operators sign in with the
// normal magic-link flow; this sets or lists application-level roles.
//
//   npx tsx scripts/operators.ts list
//   npx tsx scripts/operators.ts add <email> [Full Name] [NYC|SF]
//   npx tsx scripts/operators.ts super <email> [Full Name] [NYC|SF]
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
    select: { name: true, email: true, city: true, status: true, isSuperAdmin: true },
  });
  if (ops.length === 0) {
    console.log("No operators. Add one: npx tsx scripts/operators.ts add <email>");
    return;
  }
  console.log(`${ops.length} operator(s):`);
  for (const o of ops) {
    const role = o.isSuperAdmin ? "super admin" : "operator";
    console.log(`  - ${o.name} <${o.email}> · ${o.city} · ${o.status} · ${role}`);
  }
}

async function add(emailRaw: string, name?: string, cityRaw?: string, superAdmin = false) {
  const email = normalizeEmail(emailRaw);
  if (!email.includes("@")) throw new Error(`Invalid email: ${emailRaw}`);
  const city = (cityRaw || "").toUpperCase() === "SF" ? "SF" : "NYC";

  const existing = await prisma.person.findUnique({ where: { email } });
  if (existing) {
    const privilegeIncreased =
      !existing.isOperator || (superAdmin && !existing.isSuperAdmin);
    await prisma.$transaction([
      prisma.person.update({
        where: { id: existing.id },
        data: {
          isOperator: true,
          isSuperAdmin: superAdmin || existing.isSuperAdmin,
          ...(superAdmin ? { status: "active" } : {}),
        },
      }),
      ...(privilegeIncreased
        ? [
            prisma.session.deleteMany({ where: { personId: existing.id } }),
            prisma.loginToken.deleteMany({ where: { email } }),
          ]
        : []),
    ]);
    console.log(`Promoted existing account to ${superAdmin ? "super admin" : "operator"}: ${email}`);
  } else {
    const local = email.split("@")[0].replace(/[._-]+/g, " ").trim();
    const fallback = local ? local.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60) : "Operator";
    await prisma.$transaction([
      prisma.person.create({
        data: {
          email,
          name: name?.slice(0, 60) || fallback,
          city,
          isOperator: true,
          isSuperAdmin: superAdmin,
          status: "active",
          headline: "Matchmaker",
        },
      }),
      prisma.loginToken.deleteMany({ where: { email } }),
    ]);
    console.log(`Created ${superAdmin ? "super admin" : "operator"}: ${email} (${city})`);
  }
  console.log(`They can sign in at /login with this email.`);
}

async function remove(emailRaw: string) {
  const email = normalizeEmail(emailRaw);
  const person = await prisma.person.findUnique({ where: { email } });
  if (!person || !person.isOperator) throw new Error(`Not an operator: ${email}`);
  if (person.isSuperAdmin) {
    throw new Error("Refusing to remove a super admin with the ordinary remove command.");
  }
  const count = await prisma.person.count({ where: { isOperator: true } });
  if (count <= 1) throw new Error("Refusing to remove the last operator (lockout).");
  await prisma.$transaction([
    prisma.person.update({
      where: { id: person.id },
      data: {
        isOperator: false,
        isSuperAdmin: false,
        status: "paused",
        openToMatch: false,
        optedInAt: null,
      },
    }),
    prisma.session.deleteMany({ where: { personId: person.id } }),
  ]);
  console.log(`Revoked operator access: ${email} (account kept)`);
}

(async () => {
  const [cmd, ...args] = process.argv.slice(2);
  try {
    if (cmd === "list" || !cmd) await list();
    else if (cmd === "add") await add(args[0], args[1], args[2]);
    else if (cmd === "super") await add(args[0], args[1], args[2], true);
    else if (cmd === "remove") await remove(args[0]);
    else {
      console.error(`Unknown command: ${cmd}`);
      console.error("Usage: list | add <email> [name] [NYC|SF] | super <email> [name] [NYC|SF] | remove <email>");
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("Error:", (e as Error).message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
