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
  let adaId: string | null = null;

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
    // Pills backed by real radios now, not a native select: click the choice.
    await memberPage.getByRole("group", { name: "You are" }).getByText("Man", { exact: true }).click();
    await memberPage.getByLabel("Date of birth").fill("1990-01-01");
    await memberPage.getByLabel("Instagram").fill("@journey-member");
    await memberPage
      .getByLabel("What you're looking for")
      .fill("A thoughtful relationship with someone curious and kind.");
    // The real checkbox is visually hidden behind the mark we draw, so this
    // presses the mark, which is what a member presses. Not the sentence: it
    // carries the Terms and Privacy links, and a click in the middle of it
    // would open one of those rather than toggle consent.
    await memberPage
      .locator('label:has(input[name="agree"])')
      .click({ position: { x: 10, y: 12 } });
    assert.equal(
      await memberPage.getByRole("checkbox", { name: /I am 18 or older/ }).isChecked(),
      true,
      "Pressing the consent label must actually check the underlying box.",
    );

    // A photo is required, and the uploader posts on its own rather than
    // through the form, so the server rejects a save with none. Save once with
    // no photo to prove the gate is real, then add one.
    await memberPage.getByRole("button", { name: "Save and continue" }).click();
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
      memberPage.getByRole("button", { name: /Add a photo/ }).click(),
    ]);
    await chooser.setFiles({
      name: "journey.jpg",
      mimeType: "image/jpeg",
      buffer: await testPhotoBytes(),
    });
    await memberPage.getByRole("button", { name: /Add another/ }).waitFor();

    await memberPage.getByRole("button", { name: "Save and continue" }).click();

    // The first half is saved on its own. This is the whole point of the split:
    // stopping here is no longer losing everything, so the row exists with a
    // name, a city and a face before a single friend has been named.
    await memberPage.waitForURL(/\/apply\/friends$/);
    const half = await prisma.person.findUniqueOrThrow({ where: { email: memberEmail } });
    assert.ok(half.basicsAt, "The first half must commit on its own.");
    assert.equal(half.appliedAt, null, "And must not count as a completed application.");
    assert.equal(half.name, "Journey Member");
    assert.equal(half.gender, "man");

    // The ask is specific to what they said about themselves. Getting this
    // wrong sends someone off to ask the wrong two people.
    await memberPage.getByText("Name two women who know you well.").waitFor();

    await memberPage.getByLabel("Their name").first().fill("Ada Recommender");
    await memberPage.getByRole("group", { name: "They are" }).first().getByText("Woman", { exact: true }).click();
    await memberPage.getByLabel("Their email").first().fill(firstRecommenderEmail);
    await memberPage.getByLabel("Their name").nth(1).fill("Grace Recommender");
    await memberPage.getByRole("group", { name: "They are" }).nth(1).getByText("Woman", { exact: true }).click();
    await memberPage.getByLabel("Their email").nth(1).fill(secondRecommenderEmail);
    await memberPage.getByRole("button", { name: "Send the asks" }).click();
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

    // --- the friends answer, with no account and no session -----------------
    // The first one taps, which is what most people on a phone will do. The
    // page then asks for the words, and she gives them. The second writes
    // straight out. Both are answers; only the written ones can be quoted.
    for (const [index, request] of requests.entries()) {
      const friendContext = await browser.newContext();
      const friendPage = await friendContext.newPage();
      await friendPage.goto(`${baseUrl}/r/${request.token}`);
      await friendPage
        .getByRole("heading", { name: "Journey asked you to vouch for them." })
        .waitFor();

      if (index === 0) {
        await friendPage.getByRole("button", { name: /Yes, I vouch for Journey/ }).click();
        await friendPage.getByText(/is vouched for by you/).waitFor();
        assert.equal(
          (await prisma.recommendation.findUniqueOrThrow({ where: { id: request.id } })).status,
          "endorsed",
          "A tap is recorded on its own, before any words exist.",
        );
        await friendPage
          .getByLabel("What would you say about Journey?")
          .fill("Recommendation 1: Journey is the person everyone calls first, and has been for years.");
        await friendPage.getByRole("button", { name: "Add my words" }).click();
      } else {
        await friendPage
          .getByLabel("What would you say about Journey?")
          .fill(`Recommendation ${index + 1}: Journey is the person everyone calls first, and has been for years.`);
        await friendPage.getByRole("button", { name: "Send my recommendation" }).click();
      }
      // NOT the heading: "Thank you," is shown by the state after a tap and by
      // the state after words, so waiting on it resolves before the words have
      // even been posted and every assertion after it reads stale data. Wait
      // for the words themselves, which only the saved state can render.
      await friendPage.getByText(/everyone calls first/).waitFor();
      const answered = await prisma.recommendation.findUniqueOrThrow({ where: { id: request.id } });
      assert.equal(answered.status, "submitted", "The words must be saved, not just acknowledged.");
      assert.match(answered.body ?? "", /everyone calls first/);
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
    // By id, not by name: a sandbox that has run this before contains other
    // Journey Members, and a name match resolves to all of them.
    const memberLink = operatorPage.locator(`a[href="/studio/person/${member.id}"]`).first();
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

    // --- the loop: a recommender comes back and needs one friend, not two ---
    // Ada wrote Journey's recommendation. She is the warmest lead this product
    // gets, and the whole growth argument is that she converts. When she does,
    // Journey counts as one of her two.
    const adaRequest = requests.find((r) => r.email === firstRecommenderEmail)!;
    const adaContext = await browser.newContext();
    const adaPage = await adaContext.newPage();
    const adaToken = await createLoginToken(firstRecommenderEmail);
    await adaPage.goto(`${baseUrl}/apply?from=${adaRequest.token}`);
    await adaPage.getByText(/already count as one of the two recommendations/).waitFor();
    assert.equal(
      await adaPage.getByLabel("Email").inputValue(),
      firstRecommenderEmail,
      "Their address is already known, so the form must not ask for it again.",
    );

    await adaPage.goto(`${baseUrl}/auth/verify?token=${encodeURIComponent(adaToken)}`);
    await adaPage.waitForURL(/\/apply$/);
    await adaPage.getByRole("group", { name: "You are" }).getByText("Woman", { exact: true }).click();
    // She fills in her own half and saves it, exactly like anyone else. The
    // credit for having vouched shows on the second half, where the friends
    // are asked for.
    await adaPage.getByLabel("First name").fill("Ada");
    await adaPage.getByLabel("Last name").fill("Recommender");
    await adaPage.getByLabel("Date of birth").fill("1991-02-02");
    await adaPage.locator('label:has(input[name="agree"])').click({ position: { x: 10, y: 12 } });
    const [adaChooser] = await Promise.all([
      adaPage.waitForEvent("filechooser"),
      adaPage.getByRole("button", { name: /Add a photo/ }).click(),
    ]);
    await adaChooser.setFiles({ name: "ada.jpg", mimeType: "image/jpeg", buffer: await testPhotoBytes() });
    await adaPage.getByRole("button", { name: /Add another/ }).waitFor();
    await adaPage.getByRole("button", { name: "Save and continue" }).click();
    await adaPage.waitForURL(/\/apply\/friends$/);

    // waitFor rather than a one-shot innerText: the page streams behind the
    // Suspense fallback in src/app/loading.tsx, so reading innerText the
    // instant after a navigation can catch the spinner instead of the form.
    await adaPage.getByText(/You vouched for/).waitFor();
    await adaPage.getByText(/Journey Member/).first().waitFor();
    assert.equal(
      await adaPage.getByLabel("Their email").count(),
      1,
      "Exactly one friend slot, not two.",
    );
    const adaFriendEmail = `member-ada-friend-${suffix}@example.test`;
    await adaPage.getByLabel("Their name").fill("Ada Friend");
    await adaPage.getByRole("group", { name: "They are" }).getByText("Man", { exact: true }).click();
    await adaPage.getByLabel("Their email").fill(adaFriendEmail);
    await adaPage.getByRole("button", { name: "Send the ask" }).click();
    await adaPage.waitForURL(/\/apply\/thanks$/);
    await adaContext.close();

    const ada = await prisma.person.findUniqueOrThrow({ where: { email: firstRecommenderEmail } });
    adaId = ada.id;
    const adaRecs = await prisma.recommendation.findMany({ where: { applicantId: ada.id } });
    assert.equal(adaRecs.length, 2, "One named friend plus the member she vouched for.");
    assert.ok(
      adaRecs.some((r) => r.email === member.email),
      "The member she vouched for is asked to vouch back.",
    );
    assert.ok(
      adaRecs.some((r) => r.email === adaFriendEmail),
      "And the one new friend she named is asked.",
    );
    assert.equal(
      (await prisma.recommendation.findUniqueOrThrow({ where: { id: adaRequest.id } })).convertedPersonId,
      ada.id,
      "Her signup must be attributed back to the recommendation that produced it.",
    );
    assert.equal(
      await prisma.vouch.count({ where: { voucherId: ada.id, subjectId: member.id } }),
      1,
      "The vouch she already wrote becomes a member-to-member relation.",
    );

    console.log(
      "member application passed: signup token, required photo, two recommendation requests, acceptance by the friends' replies, a recommender converting on a one-friend gate, email-first opt-in and pause, and an operator-visible profile",
    );
  } finally {
    await browser.close();
    if (memberId) {
      await prisma.person.delete({ where: { id: memberId } }).catch(() => {});
    }
    if (operatorId) {
      await prisma.person.delete({ where: { id: operatorId } }).catch(() => {});
    }
    if (adaId) {
      // Vouch rows do not cascade, so they go before the people they point at.
      await prisma.vouch.deleteMany({ where: { OR: [{ voucherId: adaId }, { subjectId: adaId }] } });
      await prisma.person.delete({ where: { id: adaId } }).catch(() => {});
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
