import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { createLoginToken } from "../src/lib/auth";
import { prisma } from "../src/lib/prisma";

const baseUrl = process.env.MEMBER_E2E_BASE_URL || "http://127.0.0.1:3009";
const databaseUrl = process.env.DATABASE_URL;
if (
  !databaseUrl ||
  !["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname)
) {
  throw new Error("Member application browser checks require an isolated local database.");
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
  const suffix = randomUUID();
  const memberEmail = `member-application-${suffix}@example.test`;
  const operatorEmail = `member-operator-${suffix}@example.test`;
  const browser = await chromium.launch({ headless: true });
  const cookieUrl = new URL(baseUrl);
  let memberId: string | null = null;
  let operatorId: string | null = null;

  try {
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    await memberPage.goto(`${baseUrl}/apply`);
    await memberPage.getByLabel("Email").fill(memberEmail);
    await memberPage.getByRole("button", { name: "Send me a link" }).click();
    await memberPage.waitForURL(/\/apply\?sent=1$/);
    assert.equal(
      await prisma.loginToken.count({ where: { email: memberEmail } }),
      1,
      "The signup request must create a one-time login token.",
    );

    const rawToken = await createLoginToken(memberEmail);
    await memberPage.goto(`${baseUrl}/auth/verify?token=${encodeURIComponent(rawToken)}`);
    await memberPage.waitForURL(/\/apply$/);
    await memberPage.getByLabel("First name").fill("Journey");
    await memberPage.getByLabel("Last name").fill("Member");
    await memberPage.getByLabel("Date of birth").fill("1990-01-01");
    await memberPage.getByLabel("Instagram").fill("@journey-member");
    await memberPage
      .getByLabel("What you're looking for")
      .fill("A thoughtful relationship with someone curious and kind.");
    await memberPage.getByLabel("Who vouches for you?").fill("Journey Voucher");
    await memberPage
      .getByLabel("How do we reach them?")
      .fill("voucher@example.test");
    await memberPage
      .getByLabel("What would they say about you?")
      .fill("Journey is dependable, warm, and always brings people together.");
    await memberPage
      .getByLabel(/I am 18 or older and I agree to the Terms of Service/)
      .check();
    await memberPage.getByRole("button", { name: "Submit application" }).click();
    await memberPage.waitForURL(/\/apply\/thanks$/);

    const member = await prisma.person.findUniqueOrThrow({
      where: { email: memberEmail },
    });
    memberId = member.id;
    assert.equal(member.name, "Journey Member");
    assert.ok(member.appliedAt);
    assert.ok(member.agreedTosAt);
    assert.equal(member.openToMatch, false);
    assert.equal(member.lookingFor, "A thoughtful relationship with someone curious and kind.");
    assert.equal(member.voucherName, "Journey Voucher");
    assert.equal(member.recommendation, "Journey is dependable, warm, and always brings people together.");
    assert.equal(member.instagram, "https://instagram.com/journey-member");
    await memberContext.close();

    await prisma.person.update({
      where: { id: member.id },
      data: {
        status: "active",
        openToMatch: true,
        optedInAt: new Date(),
        acceptedAt: new Date(),
      },
    });
    const operator = await prisma.person.create({
      data: {
        name: "Journey Operator",
        email: operatorEmail,
        city: "NYC",
        status: "active",
        isOperator: true,
        isSuperAdmin: true,
      },
    });
    operatorId = operator.id;
    const operatorToken = await createSession(operator.id);
    const operatorContext = await browser.newContext();
    await operatorContext.addCookies([
      {
        name: "mc_session",
        value: operatorToken,
        domain: cookieUrl.hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const operatorPage = await operatorContext.newPage();
    await operatorPage.goto(`${baseUrl}/studio`);
    await operatorPage.getByText("Journey Member", { exact: true }).waitFor();
    await operatorPage.getByRole("link", { name: "Journey Member" }).click();
    await operatorPage.waitForURL(new RegExp(`/studio/person/${member.id}$`));
    await operatorPage.getByText("Journey Voucher", { exact: true }).waitFor();
    await operatorPage
      .getByText("A thoughtful relationship with someone curious and kind.", {
        exact: true,
      })
      .waitFor();
    await operatorContext.close();

    console.log(
      "member application passed: signup token, profile creation, and operator-visible profile",
    );
  } finally {
    await browser.close();
    if (memberId) {
      await prisma.person.delete({ where: { id: memberId } }).catch(() => {});
    }
    if (operatorId) {
      await prisma.person.delete({ where: { id: operatorId } }).catch(() => {});
    }
    await prisma.loginToken.deleteMany({
      where: { email: { in: [memberEmail, operatorEmail] } },
    });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
