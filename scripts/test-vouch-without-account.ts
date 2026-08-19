// Vouching never requires an account. This test exists to keep it that way.
//
// It is the single most load-bearing property of the growth loop and the
// easiest one to lose by accident: someone adds a `requireMemberPage()` to the
// friend's page for tidiness, or wraps the action in the same auth helper every
// other action uses, and the loop silently dies. Nobody would see an error.
// Reply rate would just fall to nearly zero, because a friend doing someone a
// favour will not create an account to do it, and the applicants they were
// asked about would stop getting in.
//
// So this asserts the property three ways: the source of the vouch surfaces
// contains no session lookup at all, the page renders with no cookie, and a
// vouch recorded with no session is accepted and counts.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { journeyContext } from "./journey-client";
import { prisma } from "../src/lib/prisma";
import {
  acceptIfRecommended,
  gateState,
  recordAnswer,
  recommendationUrl,
  saveRecommenders,
} from "../src/lib/recommendations";

const baseUrl = process.env.MEMBER_E2E_BASE_URL || "http://127.0.0.1:3009";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("The vouch checks require an isolated local database.");
}

/** Every file a friend touches on the way to vouching. */
const VOUCH_SURFACES = [
  "src/app/r/[token]/page.tsx",
  "src/app/r/[token]/RecommendationForm.tsx",
];

/** Helpers that would make an account a requirement. */
const AUTH_CALLS = [
  "getCurrentPerson",
  "getSessionPersonId",
  "requireMemberPage",
  "requireOperatorPage",
  "requireOperator",
  "requireSuperAdmin",
];

async function main() {
  // 1. The source. Cheap, and it catches the change on the day it is written
  // rather than the week the numbers look wrong.
  for (const file of VOUCH_SURFACES) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    for (const call of AUTH_CALLS) {
      assert.ok(
        !source.includes(call),
        `${file} calls ${call}. Vouching must never require an account: a friend doing someone a favour will not make one, and the applicant they were asked about stops getting in.`,
      );
    }
  }

  const created: string[] = [];
  const browser = await chromium.launch({ headless: true });
  try {
    const applicant = await prisma.person.create({
      data: {
        name: "No Account Applicant",
        email: `noacct-${randomUUID()}@example.test`,
        city: "NYC",
        gender: "man",
        status: "applicant",
        appliedAt: new Date(),
      },
    });
    created.push(applicant.id);
    const [first, second] = await saveRecommenders(applicant.id, [
      { name: "Friend One", email: `f1-${randomUUID()}@example.test`, gender: "woman" },
      { name: "Friend Two", email: `f2-${randomUUID()}@example.test`, gender: "woman" },
    ]);

    // 2. The page, in a browser carrying no cookie of any kind.
    const context = await journeyContext(browser);
    const page = await context.newPage();
    await page.goto(recommendationUrl(first.token).replace("https://hellomutuals.com", baseUrl));
    await page.getByRole("heading", { name: /asked you to vouch/ }).waitFor();
    assert.equal(
      (await context.cookies()).length,
      0,
      "Opening the vouch page must not require, or create, a session.",
    );
    // Scoped to the page's own content. The site footer carries a "Member sign
    // in" link on every page, which is chrome, not the vouch flow asking a
    // favour-doer to make an account.
    assert.equal(
      await page.locator("main").getByRole("link", { name: /sign in/i }).count(),
      0,
      "The vouch page itself must never ask a friend to sign in.",
    );
    // The one-tap vouch is reachable without an account, which is the point.
    await page.getByRole("button", { name: /Yes, I vouch for/ }).click();
    await page.getByText(/is vouched for by you/).waitFor();
    assert.equal(
      (await context.cookies()).length,
      0,
      "Vouching must not quietly enrol the friend in anything.",
    );
    await context.close();

    // 3. The record. A tap from a stranger counts toward the gate, and no
    // Person row is created for them: they are not a member and were never
    // asked to become one.
    const tapped = await prisma.recommendation.findUniqueOrThrow({ where: { id: first.id } });
    assert.equal(tapped.status, "endorsed");
    assert.equal(
      await prisma.person.count({ where: { email: first.email } }),
      0,
      "Vouching must not create an account for the friend.",
    );

    await recordAnswer(second.token, { body: "Written by someone with no account at all." });
    const outcome = await acceptIfRecommended(applicant.id);
    assert.equal(outcome.accepted, true, "Two answers from two non-members accept the applicant.");
    assert.equal(
      await prisma.person.count({ where: { email: { in: [first.email, second.email] } } }),
      0,
      "Still no accounts. Nobody was made to join to do somebody a favour.",
    );
    const state = await gateState(applicant.id);
    assert.equal(state.qualifying.length, 2);

    console.log(
      "vouch checks passed: no auth helper in the vouch surfaces, the page opens and records a vouch with no cookie, and two non-members can accept an applicant without either of them getting an account",
    );
  } finally {
    await browser.close();
    await prisma.person.deleteMany({ where: { id: { in: created } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
