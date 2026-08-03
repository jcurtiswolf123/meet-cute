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

/** A real JPEG, because /api/photos re-encodes with sharp and rejects anything
 *  it cannot decode. Generated rather than committed so there is no fixture to
 *  go stale. */
async function testPhotoBytes(): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp({
    create: { width: 480, height: 600, channels: 3, background: { r: 214, g: 196, b: 172 } },
  })
    .jpeg()
    .toBuffer();
}

async function main() {
  const suffix = randomUUID();
  const memberEmail = `member-application-${suffix}@example.test`;
  const operatorEmail = `member-operator-${suffix}@example.test`;
  const firstRecommenderEmail = `member-rec1-${suffix}@example.test`;
  const secondRecommenderEmail = `member-rec2-${suffix}@example.test`;
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

    // /apply must report what actually happened. This used to wait on
    // `sent=1`, which the page returned unconditionally, so the assertion held
    // even when no mail could possibly go out: in CI RESEND_API_KEY is unset
    // and the production build correctly refuses to send. That made this step
    // a check that the page always claims success, which is the opposite of
    // what it should verify. Accept either honest outcome, and require the
    // visible copy to match the one we got.
    await memberPage.waitForURL(/\/apply\?(sent=1|error=send)$/);
    const sent = /sent=1/.test(memberPage.url());
    const bodyText = await memberPage.locator("main").innerText();
    if (sent) {
      assert.ok(
        bodyText.includes("Check your email"),
        "A successful send must show the check-your-email confirmation.",
      );
    } else {
      assert.ok(
        bodyText.includes("We could not send the link"),
        "A failed send must say so, not claim the link is on its way.",
      );
    }

    // The token is created before the send either way, so the applicant can
    // still be let in by an operator when mail is down.
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
    await memberPage.getByLabel("You are").selectOption("man");
    await memberPage.getByLabel("Date of birth").fill("1990-01-01");
    await memberPage.getByLabel("Instagram").fill("@journey-member");
    await memberPage
      .getByLabel("What you're looking for")
      .fill("A thoughtful relationship with someone curious and kind.");
    await memberPage.getByLabel("Their name").first().fill("Ada Recommender");
    await memberPage.getByLabel("They are").first().selectOption("woman");
    await memberPage.getByLabel("Their email").first().fill(firstRecommenderEmail);
    await memberPage.getByLabel("Their name").nth(1).fill("Grace Recommender");
    await memberPage.getByLabel("They are").nth(1).selectOption("woman");
    await memberPage.getByLabel("Their email").nth(1).fill(secondRecommenderEmail);
    await memberPage
      .getByLabel(/I am 18 or older and I agree to the Terms of Service/)
      .check();

    // A photo is required now, and the uploader posts on its own rather than
    // through the form, so the server rejects a submit with none. Submit once
    // with no photo to prove the gate is real, then add one.
    await memberPage.getByRole("button", { name: "Submit application" }).click();
    await memberPage
      .getByText("Add at least one photo. Your matchmaker and your introduction both need a face.")
      .waitFor();
    assert.equal(
      new URL(memberPage.url()).pathname,
      "/apply",
      "An application with no photo must not be accepted.",
    );

    // Through the real control (a button that opens the file chooser), not by
    // setting files on the hidden input, so this covers the path a member takes.
    const [chooser] = await Promise.all([
      memberPage.waitForEvent("filechooser"),
      memberPage.getByRole("button", { name: "Upload photos" }).click(),
    ]);
    await chooser.setFiles({
      name: "journey.jpg",
      mimeType: "image/jpeg",
      buffer: await testPhotoBytes(),
    });
    await memberPage.getByRole("button", { name: "Add another photo" }).waitFor();

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
    assert.equal(member.gender, "man");
    assert.equal(member.lookingFor, "A thoughtful relationship with someone curious and kind.");
    assert.equal(member.instagram, "https://instagram.com/journey-member");
    assert.equal(
      member.status,
      "applicant",
      "Submitting the form does not accept anyone. Two friends writing back does.",
    );
    assert.equal(
      await prisma.photo.count({ where: { personId: member.id, status: "approved" } }),
      1,
      "The uploaded photo must be live immediately, with no review queue.",
    );

    // The waiting page names the friends and says who has answered.
    const waitingText = await memberPage.locator("main").innerText();
    assert.match(waitingText, /Ada Recommender/, "The waiting page must name who was asked.");
    assert.match(waitingText, /Grace Recommender/);

    const requests = await prisma.recommendation.findMany({
      where: { applicantId: member.id },
      orderBy: { createdAt: "asc" },
    });
    assert.equal(requests.length, 2, "Both friends must have a request row.");
    assert.ok(requests.every((r) => r.requestedAt), "Both requests must be sent, not just recorded.");
    await memberContext.close();

    // --- the friends write back, with no account and no session -------------
    for (const [index, request] of requests.entries()) {
      const friendContext = await browser.newContext();
      const friendPage = await friendContext.newPage();
      await friendPage.goto(`${baseUrl}/r/${request.token}`);
      await friendPage
        .getByRole("heading", { name: "Journey asked you to vouch for them." })
        .waitFor();
      await friendPage
        .getByLabel("What would you say about Journey?")
        .fill(`Recommendation ${index + 1}: Journey is the person everyone calls first, and has been for years.`);
      await friendPage.getByRole("button", { name: "Send my recommendation" }).click();
      await friendPage.getByRole("heading", { name: /Thank you,/ }).waitFor();
      await friendContext.close();
    }

    const afterRecommendations = await prisma.person.findUniqueOrThrow({ where: { id: member.id } });
    assert.equal(
      afterRecommendations.status,
      "active",
      "Two recommendations from the opposite gender accept the applicant.",
    );
    assert.ok(afterRecommendations.acceptedAt);
    assert.match(
      afterRecommendations.recommendation ?? "",
      /Journey is the person everyone calls first/,
      "The lead recommendation is copied onto the profile field the introduction email reads.",
    );

    const memberToken = await createSession(member.id);
    const approvedMemberContext = await browser.newContext();
    await approvedMemberContext.addCookies([
      {
        name: "mc_session",
        value: memberToken,
        domain: cookieUrl.hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const approvedMemberPage = await approvedMemberContext.newPage();
    await approvedMemberPage.goto(`${baseUrl}/app`);
    await approvedMemberPage
      .getByText(
        "Opt in and your matchmaker starts looking for the right introduction for you. If they find one, Mutuals will email you the introduction. You can say yes or pass on your own, and a mutual yes connects you both by email. No swiping, no feed.",
        { exact: true },
      )
      .waitFor();
    assert.doesNotMatch(
      await approvedMemberPage.locator("main").innerText(),
      /get a text|reply y|over text/i,
      "Member home must not promise SMS-only introductions or connections.",
    );
    await approvedMemberPage
      .getByRole("button", { name: "Opt in to get matched" })
      .click();
    await approvedMemberPage
      .getByRole("heading", { name: "You are in." })
      .waitFor();
    await approvedMemberPage
      .getByText(
        "Your matchmaker is looking for your next introduction. When they find a fit, Mutuals will email you the introduction. You can decide from the email or your profile page, on your own. A good introduction is worth the wait.",
        { exact: true },
      )
      .waitFor();
    assert.equal(
      (await prisma.person.findUniqueOrThrow({ where: { id: member.id } })).openToMatch,
      true,
      "The member opt-in action must mark the approved member ready to match.",
    );
    await approvedMemberPage
      .getByRole("button", { name: "Pause matching for now" })
      .click();
    await approvedMemberPage
      .getByRole("heading", { name: "Ready to meet someone?" })
      .waitFor();
    assert.equal(
      (await prisma.person.findUniqueOrThrow({ where: { id: member.id } })).openToMatch,
      false,
      "The member pause action must remove the approved member from matching.",
    );
    await approvedMemberContext.close();

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
    assert.equal(
      await prisma.person.count({
        where: {
          id: member.id,
          isOperator: false,
          isAmbassador: false,
          isCoach: false,
          status: "active",
        },
      }),
      1,
      "The approved member must satisfy the Studio directory query.",
    );
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
    assert.equal(
      new URL(operatorPage.url()).pathname,
      "/studio",
      `Operator session was redirected to ${new URL(operatorPage.url()).pathname}.`,
    );
    await operatorPage.getByRole("heading", { name: "Directory" }).waitFor();
    const directoryText = await operatorPage.locator("main").innerText();
    assert.match(
      directoryText,
      /Journey Member/,
      "The Studio directory did not render the approved member.",
    );
    const memberLink = operatorPage.getByRole("link", { name: /Journey Member/ });
    await memberLink.waitFor();
    await memberLink.click();
    await operatorPage.waitForURL(new RegExp(`/studio/person/${member.id}$`));
    // The operator sees the recommendations the friends actually wrote, not a
    // line the applicant wrote on their behalf.
    await operatorPage.getByText("Ada Recommender", { exact: false }).first().waitFor();
    await operatorPage
      .getByText(/Journey is the person everyone calls first/)
      .first()
      .waitFor();
    // Scoped to the profile's own "Looking for" box. The page also seeds the
    // introduction composer from this field, so an unscoped exact match now
    // resolves to two elements.
    await operatorPage
      .locator('[data-field="Looking for"]')
      .getByText("A thoughtful relationship with someone curious and kind.", {
        exact: true,
      })
      .waitFor();
    await operatorContext.close();

    console.log(
      "member application passed: signup token, required photo, two recommendation requests, acceptance by the friends' replies, email-first opt-in and pause, and an operator-visible profile",
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
    // Recommendation request mail is addressed to the friend, not the applicant,
    // so those jobs carry no personId and do not cascade with the member.
    await prisma.deliveryJob.deleteMany({
      where: { recipient: { in: [firstRecommenderEmail, secondRecommenderEmail] } },
    });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
