// Walk the real application, on the real site, against the real database.
//
//   npx tsx scripts/prod-application-walk.ts --yes
//
// The launch suite already walks these six steps, but it refuses to run against
// anything except an isolated local database, which is the right guard and also
// means nothing has ever proven the deployed build. A green CI run proves the
// tree was good when it was tested. It does not prove the container that came
// out of it serves the flow, that its Resend key is present, that Vercel Blob
// took the photo, or that the two asks left the building. Those are all
// production-only facts and every one of them has broken here before.
//
// So this signs up, answers all six questions, uploads a face, names two
// friends, opens one ask, vouches, and then deletes every row it made. It only
// ever touches addresses it generated itself, under one prefix, and the cleanup
// refuses to widen past them. It emails nobody but Josh: the applicant and both
// recommenders are plus-addresses on his own mailbox.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chromium, type Browser, type Page } from "playwright";
import { prisma } from "../src/lib/prisma";

const BASE = (process.env.PROD_WALK_BASE_URL || "https://hellomutuals.com").replace(/\/$/, "");
// Every address this script creates starts here, and cleanup will not delete a
// row whose email does not. A destructive script on the live roster gets one
// filter it cannot be talked out of.
const PREFIX = "josh+mutuals-walk-";
const MAILBOX = "shiftsupportnetwork.com";

const confirmed = process.argv.includes("--yes");
const keep = process.argv.includes("--keep");

function isWalkAddress(email: string): boolean {
  return email.startsWith(PREFIX) && email.endsWith(`@${MAILBOX}`);
}

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A real JPEG, because /api/photos re-encodes with sharp and rejects anything
 *  it cannot decode. */
async function faceBytes(): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp({
    create: { width: 480, height: 600, channels: 3, background: { r: 214, g: 196, b: 172 } },
  })
    .jpeg()
    .toBuffer();
}

/** Sign in without waiting on mail. The magic link is the one part of this walk
 *  whose delivery we assert on rather than depend on: if Resend is down the
 *  walk should say so, not hang for ten minutes in a browser. */
async function signIn(page: Page, email: string): Promise<string> {
  // Stand the row up exactly as a real sign-in does: name from the email local
  // part, city defaulted to New York. Both matter. If this seeded "Walk
  // Applicant" and San Francisco, the two assertions below that step one and
  // step two commit would pass against a row that was already correct before
  // anyone typed anything, which is the precise mistake that made resume land
  // people on step three.
  const person = await prisma.person.upsert({
    where: { email },
    create: { email, name: email.split("@")[0], city: "NYC", status: "applicant" },
    update: {},
  });
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      tokenHash: hash(token),
      personId: person.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  await page.context().addCookies([
    {
      name: "mc_session",
      value: token,
      domain: new URL(BASE).hostname,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
  return person.id;
}

async function walk(browser: Browser, applicant: string, friends: string[]): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);

  await signIn(page, applicant);
  await page.goto(`${BASE}/apply`);

  // Step one. The name is typed rather than inherited, and it has to land on
  // the row before step two is drawn: that commit-per-screen is the entire
  // reason the application was split up.
  await page.getByLabel("First name").fill("Walk");
  await page.getByLabel(/Last name/).fill("Applicant");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("group", { name: "City" }).waitFor();
  assert.equal(
    (await prisma.person.findUniqueOrThrow({ where: { email: applicant } })).name,
    "Walk Applicant",
    "Step one must commit before step two is shown.",
  );

  await page.getByRole("group", { name: "City" }).getByText("San Francisco", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("group", { name: "You are" }).waitFor();
  assert.equal(
    (await prisma.person.findUniqueOrThrow({ where: { email: applicant } })).city,
    "SF",
    "Step two must commit the city they chose over the default they were given, stored canonically.",
  );

  // Leave, come back, and land where they stopped. On production this is worth
  // asserting for its own reason: resume reads a column, and a column only
  // added yesterday is exactly the kind of thing a migration forgets to carry.
  await page.goto(`${BASE}/apply`);
  await page.getByRole("group", { name: "You are" }).waitFor();
  assert.match(
    await page.locator("h1").first().innerText(),
    /How do you identify/,
    "Coming back must resume on the unanswered step.",
  );

  await page.getByRole("group", { name: "You are" }).getByText("Man", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Date of birth").fill("1990-01-01");
  await page.getByRole("button", { name: "Continue" }).click();

  // The photo goes through /api/photos to Vercel Blob in production and to
  // Postgres locally, so this is the only place that path is ever exercised for
  // real.
  await page.getByRole("button", { name: /Add a photo/ }).waitFor();
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: /Add a photo/ }).click(),
  ]);
  await chooser.setFiles({ name: "walk.jpg", mimeType: "image/jpeg", buffer: await faceBytes() });
  await page.getByRole("button", { name: /Add another/ }).waitFor();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel(/What you're looking for/).fill("Proving the deployed build serves the real flow.");
  await page.locator('label:has(input[name="agree"])').click({ position: { x: 10, y: 12 } });
  await page.getByRole("button", { name: /Continue to your two friends/ }).click();
  await page.waitForURL(/\/apply\/friends$/);

  const half = await prisma.person.findUniqueOrThrow({ where: { email: applicant } });
  assert.ok(half.basicsAt, "The first half must commit on its own.");
  assert.equal(half.appliedAt, null, "A half-finished application must not count as one.");
  assert.equal(half.gender, "man");
  assert.equal(await prisma.photo.count({ where: { personId: half.id, status: "approved" } }), 1);

  // The ask is derived from what he just said about himself. Getting this wrong
  // sends someone to ask the wrong two people, and the gate never opens.
  await page.getByText("Name two women who know you well.").waitFor();

  await page.getByLabel("Their name").first().fill("Ada Walk");
  await page.getByRole("group", { name: "They are" }).first().getByText("Woman", { exact: true }).click();
  await page.getByLabel("Their email").first().fill(friends[0]);
  await page.getByLabel("Their name").nth(1).fill("Grace Walk");
  await page.getByRole("group", { name: "They are" }).nth(1).getByText("Woman", { exact: true }).click();
  await page.getByLabel("Their email").nth(1).fill(friends[1]);
  await page.getByRole("button", { name: "Send the asks" }).click();
  await page.waitForURL(/\/apply\/thanks$/);

  const applied = await prisma.person.findUniqueOrThrow({ where: { email: applicant } });
  assert.ok(applied.appliedAt, "Naming two friends completes the application.");
  assert.equal(
    applied.status,
    "applicant",
    "Submitting the form still accepts nobody. Two friends writing back does.",
  );

  const asks = await prisma.recommendation.findMany({
    where: { applicantId: applied.id },
    orderBy: { createdAt: "asc" },
  });
  assert.equal(asks.length, 2, "Both friends must have been asked.");
  assert.ok(
    asks.every((ask) => ask.requestedAt),
    "An ask with no requestedAt never went out.",
  );

  // The production-only fact this whole script exists for. requestedAt says the
  // code stamped a column. It does not say Resend was reachable, that the key
  // in this container is live, or that anything arrived. The outbox does: a job
  // reaches "sent" only after the provider accepted it and handed back an id.
  await waitForSentAsks(friends);

  // One friend answers, with no account and no sign-in, in a clean context.
  const friendContext = await browser.newContext();
  const friendPage = await friendContext.newPage();
  friendPage.setDefaultTimeout(45_000);
  await friendPage.goto(`${BASE}/r/${asks[0].token}`);
  await friendPage
    .getByLabel(/What would you say about/)
    .fill("She is the most generous person I know, and she listens like it costs her nothing.");
  await friendPage.getByLabel(/How do you know each other/).fill("Roommates in college.");
  await friendPage.getByRole("button", { name: "Send my recommendation" }).click();
  await friendPage.getByText(/Thank you,/).waitFor();

  const answered = await prisma.recommendation.findUniqueOrThrow({ where: { id: asks[0].id } });
  assert.equal(answered.status, "submitted", "Words are a submitted recommendation, not a tap.");
  assert.ok(answered.body, "And the words must be stored.");

  const stillApplicant = await prisma.person.findUniqueOrThrow({ where: { id: applied.id } });
  assert.equal(
    stillApplicant.status,
    "applicant",
    "One friend is not two. The gate must not open on the first answer.",
  );

  await context.close();
  await friendContext.close();
}

/** The outbox is asynchronous by design, so poll rather than assume. */
async function waitForSentAsks(friends: string[]): Promise<void> {
  const deadline = Date.now() + 90_000;
  for (;;) {
    const jobs = await prisma.deliveryJob.findMany({
      where: { kind: "recommendation_request", recipient: { in: friends } },
      select: { recipient: true, status: true, providerMessageId: true, lastError: true },
    });
    const sent = jobs.filter((job) => job.status === "sent" && job.providerMessageId);
    if (sent.length === friends.length) {
      for (const job of sent) console.log(`  ask to ${job.recipient} sent, resend id ${job.providerMessageId}`);
      return;
    }
    const failed = jobs.filter((job) => job.status === "failed");
    assert.equal(failed.length, 0, `An ask failed to send: ${failed.map((job) => job.lastError).join("; ")}`);
    assert.ok(
      Date.now() < deadline,
      `Only ${sent.length} of ${friends.length} asks reached the provider within 90s. Statuses: ${jobs.map((job) => `${job.recipient}=${job.status}`).join(", ")}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

async function cleanUp(emails: string[]): Promise<void> {
  for (const email of emails) {
    assert.ok(isWalkAddress(email), `Refusing to delete rows for ${email}: not an address this walk created.`);
  }
  const people = await prisma.person.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = people.map((p) => p.id);
  if (ids.length) {
    await prisma.recommendation.deleteMany({ where: { applicantId: { in: ids } } });
    await prisma.photo.deleteMany({ where: { personId: { in: ids } } });
    await prisma.session.deleteMany({ where: { personId: { in: ids } } });
    await prisma.deliveryJob.deleteMany({ where: { personId: { in: ids } } });
  }
  await prisma.recommendation.deleteMany({ where: { email: { in: emails } } });
  // Deleting by personId is not enough and the first run proved it: an ask is
  // addressed to a friend who has no row here, so eighteen jobs survived,
  // eight of them reminders scheduled to fire two days later at addresses that
  // no longer meant anything. A rehearsal that leaves future sends behind is
  // not a rehearsal.
  const outbox = await prisma.deliveryJob.deleteMany({ where: { recipient: { in: emails } } });
  if (outbox.count) console.log(`  removed ${outbox.count} queued or sent delivery job(s)`);
  await prisma.loginToken.deleteMany({ where: { email: { in: emails } } });
  await prisma.person.deleteMany({ where: { email: { in: emails } } });
  console.log(`cleaned up ${emails.length} walk address(es)`);
}

async function main() {
  const host = new URL(process.env.DATABASE_URL || "postgres://none/").hostname;
  console.log(`site:     ${BASE}`);
  console.log(`database: ${host}`);
  if (!confirmed) {
    console.log("\nThis writes to whatever database is above, which in practice is production.");
    console.log("It creates one applicant and two recommendation rows and deletes them again.");
    console.log("Re-run with --yes.");
    return;
  }

  const suffix = randomUUID().slice(0, 8);
  const applicant = `${PREFIX}${suffix}@${MAILBOX}`;
  const friends = [`${PREFIX}${suffix}-a@${MAILBOX}`, `${PREFIX}${suffix}-b@${MAILBOX}`];
  const everyone = [applicant, ...friends];

  const browser = await chromium.launch({ headless: true });
  try {
    await walk(browser, applicant, friends);
    console.log("production application walk passed: six steps each committing on their own, resume on the right step, a photo stored through the live upload path, two asks sent, and one friend vouching with no account while the gate correctly stays shut on one answer");
  } finally {
    await browser.close();
    if (keep) {
      console.log(`--keep: leaving ${everyone.join(", ")} on the roster`);
    } else {
      await cleanUp(everyone);
    }
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
