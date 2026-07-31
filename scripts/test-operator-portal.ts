import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { prisma } from "../src/lib/prisma";

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
    const ordinaryContext = await browser.newContext();
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

    superContext = await browser.newContext();
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
      await superPage.getByRole("link", { name: "Matchmaking", exact: true }).count(),
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
    await superPage.getByLabel("City").selectOption("San Francisco");
    await superPage.getByRole("button", { name: "Add & invite" }).click();
    // Provisioning is a server action plus a redirect that carries the outcome
    // in the query string, and the flash only renders once that lands. A cold
    // or loaded runner takes longer than the default 30s, so wait on the
    // redirect itself rather than on the text appearing out of nowhere.
    await superPage.waitForURL(
      (url) => url.searchParams.get("operator") === "Role E2E New Operator",
      { timeout: 60_000 },
    );
    await superPage.getByText(/Role E2E New Operator was added/).waitFor({ timeout: 60_000 });
    await superPage.getByText(/invitation email failed/i).waitFor({ timeout: 60_000 });
    const created = await prisma.person.findUniqueOrThrow({
      where: { email: newOperatorEmail },
    });
    assert.equal(created.isOperator, true);
    assert.equal(created.isSuperAdmin, false);

    await superPage.getByLabel("Full name").fill(pausedMember.name);
    await superPage.getByLabel("Operator email").fill(pausedMember.email!);
    await superPage.getByLabel("City").selectOption("San Francisco");
    await superPage.getByRole("button", { name: "Add & invite" }).click();
    await superPage.waitForURL(
      (url) => url.searchParams.get("operator") === pausedMember.name,
      { timeout: 60_000 },
    );
    await superPage.getByText(/Role E2E Paused Member was added/).waitFor({ timeout: 60_000 });
    await superPage.getByText(/invitation email failed/i).waitFor({ timeout: 60_000 });
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
    // Same shape as the invite above: the outcome rides in the query string and
    // the flash only renders once the redirect lands, so wait on the redirect
    // rather than on text appearing.
    await superPage.waitForURL(
      (url) =>
        url.searchParams.get("access") === "revoked" &&
        url.searchParams.get("operator") === ordinaryOperator.name,
      { timeout: 60_000 },
    );
    await superPage
      .getByText(`Studio access was revoked for ${ordinaryOperator.name}.`)
      .waitFor({ timeout: 60_000 });
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
