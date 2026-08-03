// Local QA helper: mint a session cookie for an operator and for a member so
// authed pages can be smoke-checked with curl. Prints raw tokens. Local DB only.
import { randomBytes, createHash } from "node:crypto";

async function main() {
  const url = process.env.DATABASE_URL || "";
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(`Refusing to run: DATABASE_URL is not local (${url.slice(0, 40)}...)`);
  }
  const { prisma } = await import("../src/lib/prisma");
  const hash = (t: string) => createHash("sha256").update(t).digest("hex");

  async function sessionFor(where: object, create: () => Promise<{ id: string; name: string }>) {
    let person = await prisma.person.findFirst({ where });
    if (!person) person = (await create()) as never;
    const token = randomBytes(32).toString("hex");
    await prisma.session.create({
      data: {
        tokenHash: hash(token),
        personId: person!.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      },
    });
    return { token, name: person!.name };
  }

  const op = await sessionFor({ isOperator: true }, () =>
    prisma.person.create({
      data: { name: "QA Operator", email: "qa-op@example.com", city: "NYC", isOperator: true, status: "active" },
    }),
  );
  const member = await sessionFor({ isOperator: false, status: "active" }, () =>
    prisma.person.create({
      data: { name: "QA Member", email: "qa-member@example.com", city: "NYC", status: "active" },
    }),
  );

  console.log(`OP_TOKEN=${op.token}`);
  console.log(`MEMBER_TOKEN=${member.token}`);
  console.log(`OP_NAME=${op.name}`);
  console.log(`MEMBER_NAME=${member.name}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
