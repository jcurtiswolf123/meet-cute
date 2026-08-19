import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chromium, type Page } from "playwright";
import { journeyContext } from "./journey-client";
import { prisma } from "../src/lib/prisma";
import { waitForRow } from "./journey-waits";

const baseUrl = process.env.ROLE_E2E_BASE_URL || "http://127.0.0.1:3009";
const testDomain = "roles-e2e.test";
const suffix = randomUUID();
const fixtureEmail = (label: string) => `${label}-${suffix}@${testDomain}`;
const databaseUrlRaw = process.env.DATABASE_URL;

if (
  !databaseUrlRaw ||
  !["127.0.0.1", "localhost"].includes(new URL(databaseUrlRaw).hostname)
) {
  throw new Error("Operator portal browser checks require an isolated local database.");
}

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function createSession(personId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      tokenHash: hash(token),
      personId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return token;
}


// The city control is a listbox we draw, not a native select, so there is no
// selectOption to call: open it and press the option, which is what an operator
// does. See src/components/select.tsx.
async function chooseCity(page: Page, label: string) {
  await page.getByRole("button", { name: "City" }).click();
  await page.getByRole("listbox", { name: "City" }).getByRole("option", { name: label }).click();
}

/** Studio actions are the same shape as the application steps: a server action,
 *  a redirect, and an outcome that lands on the row before the flash renders.
 *  See scripts/journey-waits.ts for why none of these wait on a URL. */
const waitForOperatorRow = (email: string) =>
  waitForRow({ email }, () => true, `Adding an operator did not create ${email}`);

const waitForOperatorPromotion = (personId: string) =>
  waitForRow({ id: personId }, (row) => row.isOperator, `Promoting ${personId} to operator`);

/** The flash copy for each invite outcome addOperator can redirect with.
 *  Kept in the same order as src/app/studio/(portal)/team/page.tsx. */
const INVITE_FLASH: Record<string, RegExp> = {
  sent: /was added and the sign-in link was sent/i,
  failed: /was added, but the invitation email failed/i,
  created: /was added\. Ask them to request a link/i,
};

/** Submit the add-operator form and report the invite status the server action
 *  actually redirected with.
 *
 *  Which status that is depends on whether the invitation email left the box:
 *  addOperator sends the magic link and answers `sent` or `failed` on the
 *  result (src/lib/actions.ts). The sandbox mailer prints the link and
 *  succeeds, so a developer running `npm run dev` gets `sent`; a box with no
 *  mailer configured gets `failed`. It is an environment fact, not a property
 *  of the code under test, so the test cannot know it in advance.
 *
 *  It used to try. The assertion was hardcoded to `invitation email failed`,
 *  and the fallback for a dropped client navigation navigated to a URL the
 *  test wrote itself carrying `invite=failed`. That made the check
 *  self-fulfilling: on a run where the navigation dropped, the test asserted
 *  against a page it had just asked for and passed; on a run where the
 *  navigation landed, the real flash said the link was sent and the assertion
 *  sat for its full 60s and timed out. Both navigations had to drop for the
 *  test to pass, which is why doubling the timeout never helped.
 *
 *  So read the status off the 303 the action answers with, and let the caller
 *  assert the flash that belongs to it. */
async function addOperatorAndReadInviteStatus(page: Page): Promise<string> {
  // A server action's redirect does not travel in Location. Next answers the
  // action POST 303 and puts the target in x-action-redirect, suffixed with the
  // history mode: "/studio/team?invite=sent&operator=Name;push". Location is
  // read as a fallback in case that ever changes.
  const redirect = page
    .waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.status() === 303 &&
        new URL(response.url()).pathname === "/studio/team",
      { timeout: 60_000 },
    )
    .then((response) => {
      const headers = response.headers();
      return (headers["x-action-redirect"] || headers["location"] || "").split(";")[0]!;
    })
    .catch(() => "");

  await page.getByRole("button", { name: "Add & invite" }).click();

  const target = await redirect;
  const status = target
    ? (new URL(target, baseUrl).searchParams.get("invite") ?? "")
    : "";
  assert.ok(
    status in INVITE_FLASH,
    `addOperator redirected with an invite status this test does not know: ${
      target || "(no redirect seen)"
    }`,
  );
  return status;
}

/** Put the page on the flash for `name`, whether or not the client navigation
 *  landed.
 *
 *  The two guards this replaces asked whether the URL carried *an* `operator=`
 *  at all. It always does after the first invite, so on the second invite a
 *  navigation that did not land left the page showing the first operator's
 *  flash, the fallback was skipped as unnecessary, and the assertion waited 60
 *  seconds for text that could never appear. Both accounts had been created:
 *  the only thing wrong was which flash was on screen. Asking for this name
 *  is the question that was meant.
 *
 *  `invite` is the status the action itself redirected with, read by
 *  addOperatorAndReadInviteStatus. Writing a fixed one here is what made the
 *  old check self-fulfilling. */
async function ensureFlashFor(page: Page, name: string, invite: string) {
  const wanted = `operator=${encodeURIComponent(name)}`;
  if (page.url().includes(wanted)) return;
  console.log(`  note: the post-action navigation did not land for ${name}; checking the flash directly`);
  await page.goto(`${baseUrl}/studio/team?invite=${invite}&${wanted}`);
}

async function main() {
  await prisma.person.deleteMany({
    where: { email: { endsWith: `@${testDomain}` } },
  });
  await prisma.loginToken.deleteMany({
    where: { email: { endsWith: `@${testDomain}` } },
  });

  const jess = await prisma.person.findUniqueOrThrow({
    where: { email: "jesswolflord@gmail.com" },
  });
  assert.equal(jess.isOperator, true);
  assert.equal(jess.isSuperAdmin, true);

  const ordinaryOperator = await prisma.person.create({
    data: {
      name: "Role E2E Operator",
      email: fixtureEmail("operator"),
      city: "NYC",
      status: "active",
      isOperator: true,
    },
  });
  const pausedMember = await prisma.person.create({
    data: {
      name: "Role E2E Paused Member",
      email: fixtureEmail("paused-member"),
      city: "SF",
      status: "paused",
    },
  });
  const priorPausedMemberTokenHash = randomUUID();
  await prisma.loginToken.create({
    data: {
      tokenHash: priorPausedMemberTokenHash,
      email: pausedMember.email!,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const ordinaryToken = await createSession(ordinaryOperator.id);
  await createSession(pausedMember.id);
  const jessToken = await createSession(jess.id);
  const browser = await chromium.launch({ headless: true });
  // Hoisted so the failure diagnostic below can still read the page.
  let superContext: Awaited<ReturnType<typeof browser.newContext>> | null = null;
  const cookieUrl = new URL(baseUrl);

  try {
    const ordinaryContext = await journeyContext(browser);
    await ordinaryContext.addCookies([
      {
        name: "mc_session",
        value: ordinaryToken,
        domain: cookieUrl.hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const ordinaryPage = await ordinaryContext.newPage();
    await ordinaryPage.goto(`${baseUrl}/studio/team`);
    await ordinaryPage.getByRole("heading", { name: "Team" }).waitFor();
    assert.equal(
      await ordinaryPage.getByRole("heading", { name: "Add an operator" }).count(),
      0,
    );
    assert.equal(
      await ordinaryPage.getByRole("heading", { name: "Operator access" }).count(),
      1,
    );
    await ordinaryPage.goto(
      `${baseUrl}/studio/team?invite=sent&operator=Forged%20Operator`,
    );
    assert.equal(
      await ordinaryPage.getByText(
        "Forged Operator was added and the sign-in link was sent.",
      ).count(),
      0,
    );
    await ordinaryPage.goto(`${baseUrl}/studio/matchmaking`);
    assert.equal(new URL(ordinaryPage.url()).pathname, "/studio/matchmaking");
    await ordinaryContext.close();

    superContext = await journeyContext(browser);
    await superContext.addCookies([
      {
        name: "mc_session",
        value: jessToken,
        domain: cookieUrl.hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const superPage = await superContext.newPage();
    await superPage.goto(`${baseUrl}/studio/team`);
    await superPage.getByRole("heading", { name: "Add an operator" }).waitFor();
    assert.equal(await superPage.getByText("Super admin", { exact: true }).count(), 1);

    const sidebar = superPage.locator("[data-portal-sidebar]");
    await superPage.waitForFunction(
      () =>
        document.querySelector("[data-portal-sidebar]")?.getAttribute("data-collapsed") ===
        "true",
    );
    await superPage.waitForFunction(
      () =>
        (document.querySelector("[data-portal-sidebar]")?.getBoundingClientRect().width ?? 999) <
        80,
    );
    assert.ok((await sidebar.boundingBox())!.width < 80);

    await sidebar.hover();
    await superPage.waitForFunction(
      () =>
        document.querySelector("[data-portal-sidebar]")?.getAttribute("data-collapsed") ===
        "false",
    );
    await superPage.waitForFunction(
      () =>
        (document.querySelector("[data-portal-sidebar]")?.getBoundingClientRect().width ?? 0) >
        200,
    );
    assert.ok((await sidebar.boundingBox())!.width > 200);
    const quickSearch = superPage.getByLabel("Quick search");
    await quickSearch.fill("Team");
    assert.equal(await superPage.getByRole("link", { name: "Team", exact: true }).count(), 1);
    assert.equal(
      await superPage.getByRole("link", { name: "Introduce", exact: true }).count(),
      0,
    );
    await quickSearch.fill("");

    await superPage.locator("main").hover();
    await superPage.waitForFunction(
      () =>
        document.querySelector("[data-portal-sidebar]")?.getAttribute("data-collapsed") ===
        "true",
    );
    await superPage.waitForFunction(
      () =>
        (document.querySelector("[data-portal-sidebar]")?.getBoundingClientRect().width ?? 999) <
        80,
    );
    assert.ok((await sidebar.boundingBox())!.width < 80);

    await sidebar.hover();
    await superPage.getByRole("button", { name: "Keep sidebar open" }).click();
    await superPage.locator("main").hover();
    await superPage.waitForFunction(
      () =>
        document.querySelector("[data-portal-sidebar]")?.getAttribute("data-collapsed") ===
        "false",
    );
    await superPage.waitForFunction(
      () =>
        (document.querySelector("[data-portal-sidebar]")?.getBoundingClientRect().width ?? 0) >
        200,
    );
    assert.ok((await sidebar.boundingBox())!.width > 200);
    await superPage.getByRole("button", { name: "Collapse sidebar" }).click();
    await superPage.waitForFunction(
      () =>
        document.querySelector("[data-portal-sidebar]")?.getAttribute("data-collapsed") ===
        "true",
    );

    const newOperatorEmail = fixtureEmail("new-operator");
    await superPage.getByLabel("Full name").fill("Role E2E New Operator");
    await superPage.getByLabel("Operator email").fill(newOperatorEmail);
    await chooseCity(superPage, "SF");

    // What this step is actually about is that the operator gets provisioned
    // and the super admin is told what happened to the invitation. Those are
    // two separate facts and only one of them is the client navigation.
    //
    // The navigation is the flaky one. The server action commits and answers
    // 303 with the redirect every time; the client applies it almost every
    // time. When it does not, the account still exists and the only thing
    // missing is the flash. Someone before me met this and doubled the timeout
    // to 60s, which did not fix it because waiting is not the problem.
    //
    // So: wait on the outcome in the database, which is the contract, then
    // assert the flash the action's own redirect says belongs there. If the
    // navigation did land, that assertion runs against the page the action
    // actually produced.
    const newOperatorInvite = await addOperatorAndReadInviteStatus(superPage);
    const created = await waitForOperatorRow(newOperatorEmail);
    await ensureFlashFor(superPage, "Role E2E New Operator", newOperatorInvite);
    await superPage.getByText(/Role E2E New Operator was added/).waitFor({ timeout: 60_000 });
    await superPage.getByText(INVITE_FLASH[newOperatorInvite]!).waitFor({ timeout: 60_000 });
    assert.equal(created.isOperator, true);
    assert.equal(created.isSuperAdmin, false);

    await superPage.getByLabel("Full name").fill(pausedMember.name);
    await superPage.getByLabel("Operator email").fill(pausedMember.email!);
    await chooseCity(superPage, "SF");
    // Same reason as the step above: the outcome is the promotion, not the
    // navigation, and the navigation is the part that intermittently does not
    // land. Waiting longer never fixed it because waiting was not the problem.
    const pausedMemberInvite = await addOperatorAndReadInviteStatus(superPage);
    await waitForOperatorPromotion(pausedMember.id);
    await ensureFlashFor(superPage, pausedMember.name, pausedMemberInvite);
    await superPage.getByText(/Role E2E Paused Member was added/).waitFor({ timeout: 60_000 });
    await superPage.getByText(INVITE_FLASH[pausedMemberInvite]!).waitFor({ timeout: 60_000 });
    const promoted = await prisma.person.findUniqueOrThrow({
      where: { id: pausedMember.id },
    });
    assert.equal(promoted.isOperator, true);
    assert.equal(promoted.isSuperAdmin, false);
    assert.equal(promoted.status, "paused");
    assert.equal(
      await prisma.session.count({ where: { personId: pausedMember.id } }),
      0,
    );
    const refreshedOperatorTokens = await prisma.loginToken.findMany({
      where: { email: pausedMember.email! },
      select: { tokenHash: true },
    });
    assert.equal(refreshedOperatorTokens.length, 1);
    assert.notEqual(
      refreshedOperatorTokens[0]?.tokenHash,
      priorPausedMemberTokenHash,
      "Provisioning must replace stale member login tokens with one fresh operator invite.",
    );

    await superPage.goto(`${baseUrl}/studio/team`);
    await superPage
      .getByRole("button", {
        name: `Revoke operator access for ${ordinaryOperator.name}`,
      })
      .click();
    await superPage.getByRole("button", { name: "Cancel" }).click();
    assert.equal(
      (
        await prisma.person.findUniqueOrThrow({
          where: { id: ordinaryOperator.id },
        })
      ).isOperator,
      true,
    );

    await superPage
      .getByRole("button", {
        name: `Revoke operator access for ${ordinaryOperator.name}`,
      })
      .click();
    // The confirm control only exists after the client component re-renders, and
    // the revoke itself is a server action plus a redirect. On a loaded CI runner
    // both are slow enough that clicking blind, or waiting the default 30s for
    // the flash, fails a build that has nothing wrong with it. Wait for the
    // control explicitly and give the round trip room.
    const confirmRevoke = superPage.getByRole("button", { name: "Confirm revoke" });
    await confirmRevoke.waitFor({ state: "visible" });
    await confirmRevoke.click();
    // The revoke itself, read from the row. This used to wait on the redirect
    // and then on the flash, and it is what failed the build on 4 August while
    // the page it printed showed the studio rendering perfectly well.
    await waitForRow(
      { id: ordinaryOperator.id },
      (row) => !row.isOperator,
      `Revoking studio access for ${ordinaryOperator.name}`,
    );
    const revoked = await prisma.person.findUniqueOrThrow({
      where: { id: ordinaryOperator.id },
    });
    assert.equal(revoked.isOperator, false);
    assert.equal(revoked.status, "paused");
    assert.equal(
      await prisma.session.count({ where: { personId: ordinaryOperator.id } }),
      0,
    );
    await superPage
      .getByText(ordinaryOperator.name, { exact: true })
      .waitFor({ state: "detached" });

    await superPage.setViewportSize({ width: 390, height: 844 });
    await superPage.reload();
    const openMenu = superPage.getByRole("button", { name: "Open menu" });
    await openMenu.click();
    await superPage
      .getByRole("dialog", { name: "Mutuals navigation" })
      .waitFor({ state: "visible" });
    await superPage.keyboard.press("Escape");
    await superPage
      .getByRole("dialog", { name: "Mutuals navigation" })
      .waitFor({ state: "detached" });
    assert.equal(await openMenu.evaluate((element) => element === document.activeElement), true);

    await superContext.close();

    console.log("operator portal browser checks passed");
  } catch (error) {
    // A timeout on a locator says what was expected and nothing about what was
    // actually on screen, which is most of the debugging cost when this only
    // fails on CI. Print where the page ended up and what it was showing.
    for (const page of superContext?.pages() ?? []) {
      console.error("[diagnostic] url:", page.url());
      console.error(
        "[diagnostic] main:",
        await page
          .locator("main")
          .innerText()
          .catch(() => "(unreadable)"),
      );
    }
    throw error;
  } finally {
    await browser.close();
    await prisma.person.deleteMany({
      where: { email: { endsWith: `@${testDomain}` } },
    });
    await prisma.loginToken.deleteMany({
      where: { email: { endsWith: `@${testDomain}` } },
    });
    await prisma.session.deleteMany({ where: { personId: jess.id } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
