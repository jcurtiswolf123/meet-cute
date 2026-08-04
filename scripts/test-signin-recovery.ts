// The last hole in the funnel: a sign-in link that was asked for and never used.
//
// Until this existed those people were invisible. A Person row is only created
// when a link is clicked, so somebody who requested one and lost it left
// nothing behind but a LoginToken that expired fifteen minutes later, and
// nothing in the product knew they had ever tried.
//
// Three properties worth pinning, because each of them is a way this turns from
// a recovery into a nuisance or a security hole:
//
//   - it is scheduled, not sent immediately (they may still be reading it)
//   - asking for three links produces at most one follow-up, ever
//   - signing in withdraws it, so nobody is told their link expired minutes
//     after using it
//
// The email itself carries no sign-in token, only a prefilled form. That is
// asserted in the email suite: minting a fresh long-lived token into an inbox
// nobody has proven they can read is how a magic-link system becomes an
// account-takeover system.

import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createLoginToken } from "../src/lib/auth";
import { prisma } from "../src/lib/prisma";
const base = process.env.MEMBER_E2E_BASE_URL || `http://127.0.0.1:${process.env.PORT ?? "3009"}`;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("The sign-in recovery checks require an isolated local database.");
}

async function main() {
  const email = `unused-${randomUUID()}@example.test`;
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();

  // Ask for a link and never use it.
  await p.goto(`${base}/apply`);
  await p.getByRole("button", { name: "Send me a link" }).waitFor({ timeout: 25000 });
  await p.getByLabel("Email").fill(email);
  await p.getByRole("button", { name: "Send me a link" }).click();
  await p.waitForURL(/\/apply\?(sent=1|error=send)$/, { timeout: 20000 });

  const queued = await prisma.deliveryJob.findFirst({ where: { kind: "signin_unused", recipient: email } });
  assert.ok(queued, "an unused link must schedule a follow-up");
  assert.equal(queued!.status, "pending");
  assert.ok(queued!.availableAt.getTime() > Date.now() + 2 * 3600e3, "due hours later, not now");
  console.log("follow-up scheduled, due", new Date(queued!.availableAt).toISOString());

  // Asking twice must not produce two.
  await p.goto(`${base}/apply`);
  await p.getByRole("button", { name: "Send me a link" }).waitFor({ timeout: 25000 });
  await p.getByLabel("Email").fill(email);
  await p.getByRole("button", { name: "Send me a link" }).click();
  await p.waitForURL(/\/apply\?(sent=1|error=send)$/, { timeout: 20000 });
  assert.equal(await prisma.deliveryJob.count({ where: { kind: "signin_unused", recipient: email } }), 1,
    "asking for three links still produces at most one follow-up");
  console.log("asking again does not queue a second");

  // Signing in withdraws it.
  const token = await createLoginToken(email);
  await p.goto(`${base}/auth/verify?token=${encodeURIComponent(token)}`, { waitUntil: "domcontentloaded" });
  await p.waitForURL(/\/apply$/, { timeout: 20000 });
  const after = await prisma.deliveryJob.findFirstOrThrow({ where: { kind: "signin_unused", recipient: email } });
  assert.equal(after.status, "cancelled", "signing in withdraws the follow-up");
  console.log("signing in withdrew it:", after.status);

  // And the prefill works.
  await p.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  const ctx2 = await b.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto(`${base}/apply?email=${encodeURIComponent(email)}`);
  await p2.getByRole("button", { name: "Send me a link" }).waitFor({ timeout: 25000 });
  assert.equal(await p2.getByLabel("Email").inputValue(), email, "the follow-up link prefills the address");
  console.log("prefill works");

  await b.close();
  const person = await prisma.person.findUnique({ where: { email } });
  if (person) await prisma.person.delete({ where: { id: person.id } });
  await prisma.deliveryJob.deleteMany({ where: { recipient: email } });
  await prisma.loginToken.deleteMany({ where: { email } });
  console.log(
    "sign-in recovery passed: an unused link schedules one follow-up hours later, asking again never queues a second, signing in withdraws it, and the link prefills the form",
  );
  await prisma.$disconnect();
}
main();
