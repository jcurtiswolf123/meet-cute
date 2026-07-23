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
  await prisma.loginToken.create({
    data: {
      tokenHash: randomUUID(),
      email: pausedMember.email!,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const ordinaryToken = await createSession(ordinaryOperator.id);
  await createSession(pausedMember.id);
  const jessToken = await createSession(jess.id);
  const browser = await chromium.launch({ headless: true });
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

    const superContext = await browser.newContext();
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

    const newOperatorEmail = fixtureEmail("new-operator");
    await superPage.getByLabel("Full name").fill("Role E2E New Operator");
    await superPage.getByLabel("Operator email").fill(newOperatorEmail);
    await superPage.getByLabel("City").selectOption("San Francisco");
    await superPage.getByRole("button", { name: "Add & invite" }).click();
    await superPage.getByText(/Role E2E New Operator was added/).waitFor();
    const created = await prisma.person.findUniqueOrThrow({
      where: { email: newOperatorEmail },
    });
    assert.equal(created.isOperator, true);
    assert.equal(created.isSuperAdmin, false);

    await superPage.getByLabel("Full name").fill(pausedMember.name);
    await superPage.getByLabel("Operator email").fill(pausedMember.email!);
    await superPage.getByLabel("City").selectOption("San Francisco");
    await superPage.getByRole("button", { name: "Add & invite" }).click();
    await superPage.getByText(/Role E2E Paused Member was added/).waitFor();
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
    assert.equal(
      await prisma.loginToken.count({ where: { email: pausedMember.email! } }),
      0,
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
    await superPage.getByRole("button", { name: "Confirm revoke" }).click();
    await superPage
      .getByText(`Studio access was revoked for ${ordinaryOperator.name}.`)
      .waitFor();
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
    await superContext.close();

    console.log("operator portal browser checks passed");
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
