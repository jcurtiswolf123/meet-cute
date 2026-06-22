// Mint a one-click sign-in link for any account (bypasses the email inbox,
// useful for testing accounts whose email you don't control). The token is
// single-use and expires in 15 minutes, same as a real magic link.
//
//   npx tsx scripts/login-link.ts <email>
//
// Base URL comes from NEXT_PUBLIC_APP_URL, else --base, else meet-cute.fly.dev.
import { prisma } from "../src/lib/prisma";
import { createLoginToken, normalizeEmail } from "../src/lib/auth";

(async () => {
  try {
    const arg = process.argv[2];
    if (!arg) throw new Error("Usage: npx tsx scripts/login-link.ts <email>");
    const email = normalizeEmail(arg);

    const baseArg = process.argv.find((a) => a.startsWith("--base="))?.split("=")[1];
    const base = (baseArg || process.env.NEXT_PUBLIC_APP_URL || "https://meet-cute.fly.dev").replace(/\/$/, "");

    const person = await prisma.person.findUnique({ where: { email } });
    if (!person) throw new Error(`No account with email ${email}. Create it first.`);

    const token = await createLoginToken(email);
    const link = `${base}/auth/verify?token=${encodeURIComponent(token)}`;
    const role = person.isOperator ? "OPERATOR -> /studio" : `member (${person.status}) -> ${person.status === "applicant" ? "/apply" : "/app"}`;
    console.log(`${person.name} <${email}>  [${role}]`);
    console.log(link);
    console.log("(single-use, expires in 15 minutes)");
  } catch (e) {
    console.error("Error:", (e as Error).message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
