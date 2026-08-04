// The two controls that replaced the native <select>, checked where they are
// actually load-bearing.
//
// ChoiceGroup is a real radio group behind pills. What is worth asserting is
// that it stayed one: the moment someone "improves" it into buttons plus a
// hidden input, the browser stops giving us arrow-key movement, the label hit
// area, and the "radio, 2 of 3" announcement, and nothing else would notice.
// So this checks the markup contract and then drives the group by keyboard.
//
// (It deliberately does NOT claim the form works with JavaScript disabled.
// Every page renders behind the Suspense fallback in src/app/loading.tsx and
// Next reveals streamed content with an inline script, so with scripting off an
// applicant never gets past the spinner. The radio markup would post fine; the
// page would never appear.)
//
// Select is hand-built, so every keyboard behaviour a native select gave away
// for free is now code that can regress. The second half opens it from the
// keyboard, types ahead, applies the filter, and checks Escape puts focus back.

import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chromium, type BrowserContext } from "playwright";
import { createLoginToken } from "../src/lib/auth";
import { prisma } from "../src/lib/prisma";
import { answered, waitForRow } from "./journey-waits";

const baseUrl = process.env.MEMBER_E2E_BASE_URL || "http://127.0.0.1:3009";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("Form control browser checks require an isolated local database.");
}

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function signIn(context: BrowserContext, personId: string) {
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: { tokenHash: hash(token), personId, expiresAt: new Date(Date.now() + 3_600_000) },
  });
  await context.addCookies([
    {
      name: "mc_session",
      value: token,
      domain: new URL(baseUrl).hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function main() {
  const suffix = randomUUID();
  const applicantEmail = `controls-applicant-${suffix}@example.test`;
  const operatorEmail = `controls-operator-${suffix}@example.test`;
  const browser = await chromium.launch({ headless: true });
  let applicantId: string | null = null;
  let operatorId: string | null = null;

  try {
    // --- ChoiceGroup: still a radio group, and it moves by keyboard --------
    const rawToken = await createLoginToken(applicantEmail);
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseUrl}/auth/verify?token=${encodeURIComponent(rawToken)}`);
    await page.waitForURL(/\/apply$/);
    applicantId = (await prisma.person.findUniqueOrThrow({ where: { email: applicantEmail } })).id;

    // The gender pills are on the third screen now: the application asks one
    // question at a time. Walk to them the way an applicant does.
    await page.getByLabel("First name").fill("Controls");
    await page.getByLabel("Last name").fill("Tester");
    await page.getByRole("button", { name: "Continue" }).click();
    // Wait for the step to commit before waiting for the screen it unlocks.
    // Waiting only on the City group means a slow round trip on a loaded runner
    // reads as a missing control, which is what failed the build on 4 August.
    // The row says whether the step actually happened; the group is then a
    // formality with room to render.
    await waitForRow({ email: applicantEmail }, (row) => row.name === "Controls Tester", "step one commits the name");
    await page.getByRole("group", { name: "City" }).waitFor({ timeout: 60000 });
    await page.getByRole("group", { name: "City" }).getByText("New York", { exact: true }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await waitForRow({ email: applicantEmail }, answered("city"), "step two commits the city");

    const genderGroup = page.getByRole("group", { name: "You are" });
    await genderGroup.waitFor({ timeout: 60000 });
    assert.equal(
      await genderGroup.getByRole("radio").count(),
      3,
      "The gender choice must be a radio group, not buttons with a hidden input.",
    );
    for (const value of ["woman", "man", "nonbinary"]) {
      assert.equal(
        await page.locator(`input[type="radio"][name="gender"][value="${value}"]`).count(),
        1,
        `The gender group must post ${value} as an ordinary form value.`,
      );
    }
    // The consent checkbox lives on the last step; that it stays a real
    // checkbox is asserted in the journey, which walks that far.

    // Pressing a pill selects it, and the arrow keys then move within the group
    // the way they do for any radio group. Both come from the browser, and both
    // stop working the moment this is rebuilt out of buttons.
    await genderGroup.getByText("Woman", { exact: true }).click();
    assert.equal(await page.locator('input[name="gender"][value="woman"]').isChecked(), true);
    await page.keyboard.press("ArrowRight");
    assert.equal(
      await page.locator('input[name="gender"][value="man"]').isChecked(),
      true,
      "Arrow keys must move the selection inside the group.",
    );
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator('input[name="gender"][value="nonbinary"]').isChecked(), true);

    // The rule copy that reads off this answer now lives on the second half of
    // the application, so it is asserted in the journey where that page is
    // already open rather than here, where the subject is the control itself.
    await genderGroup.getByText("Man", { exact: true }).click();
    assert.equal(await page.locator('input[name="gender"][value="man"]').isChecked(), true);
    await context.close();

    // --- Select, from the keyboard only ------------------------------------
    const operator = await prisma.person.create({
      data: {
        name: "Controls Operator",
        email: operatorEmail,
        city: "NYC",
        status: "active",
        isOperator: true,
      },
    });
    operatorId = operator.id;
    const studioContext = await browser.newContext();
    await signIn(studioContext, operator.id);
    const studio = await studioContext.newPage();
    await studio.goto(`${baseUrl}/studio`);

    const trigger = studio.getByRole("button", { name: "Filter by city" });
    await trigger.waitFor();
    assert.equal(
      await trigger.getAttribute("aria-expanded"),
      "false",
      "A closed listbox must say so.",
    );

    await trigger.focus();
    await studio.keyboard.press("Enter");
    const list = studio.getByRole("listbox", { name: "Filter by city" });
    await list.waitFor();
    assert.equal(await trigger.getAttribute("aria-expanded"), "true");

    // Type-ahead is the native behaviour people miss most when a select is
    // replaced by hand, so it is the one asserted here.
    await studio.keyboard.press("s");
    const active = await list.getAttribute("aria-activedescendant");
    // Attribute selector, not `#id`: React's useId produces ids with colons in
    // them, which are not valid in a CSS id selector.
    const activeText = active ? await studio.locator(`[id="${active}"]`).innerText() : "";
    assert.match(activeText, /SF/, `Typing "s" must move to SF, moved to "${activeText}".`);

    await studio.keyboard.press("Enter");
    await studio.waitForURL(/city=SF/);
    assert.match(studio.url(), /city=SF/, "Choosing an option must apply the filter.");
    await studio.getByRole("button", { name: "Filter by city" }).waitFor();
    assert.equal(
      await studio.getByRole("button", { name: "Filter by city" }).innerText(),
      "SF",
      "The trigger must show the chosen option after the page reloads.",
    );

    // Escape closes without choosing, and focus goes back where it came from.
    const trigger2 = studio.getByRole("button", { name: "Sort directory" });
    await trigger2.focus();
    await studio.keyboard.press("ArrowDown");
    await studio.getByRole("listbox", { name: "Sort directory" }).waitFor();
    await studio.keyboard.press("Escape");
    await studio.getByRole("listbox", { name: "Sort directory" }).waitFor({ state: "detached" });
    assert.equal(
      await trigger2.evaluate((node) => node === document.activeElement),
      true,
      "Escape must return focus to the trigger.",
    );
    await studioContext.close();

    console.log(
      "form control checks passed: the choice pills are a real radio group and move by arrow key, and the listbox opens from the keyboard, types ahead, applies the filter, and returns focus on Escape",
    );
  } finally {
    await browser.close();
    if (applicantId) await prisma.person.delete({ where: { id: applicantId } }).catch(() => {});
    if (operatorId) await prisma.person.delete({ where: { id: operatorId } }).catch(() => {});
    await prisma.loginToken.deleteMany({ where: { email: { in: [applicantEmail, operatorEmail] } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
