// The six-digit sign-in code is auth, so it gets the same treatment the link
// gets: single use, expiring, scoped to one address, and worth nothing to
// somebody guessing.
//
//   npm run test:launch:signincode
//
// Why the code exists at all is in src/lib/auth.ts: an iOS home-screen web app
// has its own cookie store, so the emailed link signs Safari in and leaves the
// installed app signed out.
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { createLoginCode, consumeLoginCode, createLoginToken, consumeLoginToken } from "../src/lib/auth";
import { magicLinkEmail } from "../src/lib/email";

const domain = "signin-code.test";
const addr = (label: string) => `${label}-${process.pid}@${domain}`;

async function main() {
  await prisma.loginToken.deleteMany({ where: { email: { endsWith: `@${domain}` } } });

  // --- shape -----------------------------------------------------------------
  const email = addr("basic");
  const code = await createLoginCode(email);
  assert.match(code, /^[0-9]{6}$/, "a code is six digits");

  // --- the happy path, and the address it is scoped to ------------------------
  assert.equal(
    await consumeLoginCode("someone-else@" + domain, code),
    null,
    "a code must not work for a different address: six digits are not unique on their own",
  );
  assert.equal(
    await consumeLoginCode(` ${email.toUpperCase()} `, code),
    email,
    "the address is normalized on the way in, so casing and stray spaces still sign in",
  );

  // --- single use --------------------------------------------------------------
  assert.equal(await consumeLoginCode(email, code), null, "a code burns on first use");

  // --- a wrong code is refused, and refusing it does not burn the real one -----
  const email2 = addr("wrong-guess");
  const good = await createLoginCode(email2);
  const wrong = good === "000000" ? "111111" : "000000";
  assert.equal(await consumeLoginCode(email2, wrong), null, "a wrong code is refused");
  assert.equal(await consumeLoginCode(email2, good), email2, "and the real code still works after");

  // --- junk in ------------------------------------------------------------------
  const email3 = addr("junk");
  const live = await createLoginCode(email3);
  for (const junk of ["", "12345", "1234567", "abcdef", "12 34 56", "  "]) {
    assert.equal(await consumeLoginCode(email3, junk), null, `refused: ${JSON.stringify(junk)}`);
  }
  assert.equal(await consumeLoginCode(email3, live), email3, "the live code survives the junk");

  // --- expiry --------------------------------------------------------------------
  const email4 = addr("expired");
  const stale = await createLoginCode(email4);
  await prisma.loginToken.updateMany({
    where: { email: email4, consumedAt: null },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal(await consumeLoginCode(email4, stale), null, "an expired code is refused");

  // --- a code and a link are independent -----------------------------------------
  // Both are minted for the same request. Using one must not silently spend the
  // other, or somebody who taps the link and then types the code gets told their
  // code is wrong.
  const email5 = addr("both");
  const token5 = await createLoginToken(email5);
  const code5 = await createLoginCode(email5);
  assert.equal(await consumeLoginToken(token5), email5, "the link works");
  assert.equal(await consumeLoginCode(email5, code5), email5, "and the code still works after it");

  // --- a link is not a code and a code is not a link -------------------------------
  const email6 = addr("crossed");
  const token6 = await createLoginToken(email6);
  const code6 = await createLoginCode(email6);
  assert.equal(await consumeLoginCode(email6, token6.slice(0, 6)), null, "a token prefix is not a code");
  assert.equal(await consumeLoginToken(code6), null, "a code is not a token");

  // --- two live codes for one address both work -------------------------------------
  // Somebody who taps "send it again" has two emails open and will read whichever
  // is on top. Invalidating the first would look like a broken code.
  const email7 = addr("resend");
  const first = await createLoginCode(email7);
  const second = await createLoginCode(email7);
  assert.notEqual(first, second, "two mints are not the same code");
  assert.equal(await consumeLoginCode(email7, first), email7, "the older code still works");
  assert.equal(await consumeLoginCode(email7, second), email7, "and so does the newer one");

  // --- the email carries both, and neither leaks the other --------------------------
  const rendered = magicLinkEmail("https://hellomutuals.com/auth/verify?token=abc", "123456");
  assert.ok(rendered.text.includes("123456"), "the plain-text body carries the code");
  assert.ok(rendered.html.includes("123456"), "so does the HTML body");
  assert.ok(rendered.html.includes("token=abc"), "and the link is still there");
  assert.ok(
    /home screen/i.test(rendered.text) && /home screen/i.test(rendered.html),
    "and it says which one to use on a phone, because that is the whole point",
  );
  const linkOnly = magicLinkEmail("https://hellomutuals.com/auth/verify?token=abc");
  assert.ok(!/code/i.test(linkOnly.text), "with no code, the body does not mention one");

  // --- digits are not lopsided --------------------------------------------------------
  // `% 10` over a random byte would make 0 through 5 about 20% likelier than 6
  // through 9, which quietly shrinks the space a guesser has to cover.
  const counts = new Array(10).fill(0);
  const email8 = addr("distribution");
  for (let i = 0; i < 200; i++) {
    for (const digit of await createLoginCode(email8)) counts[Number(digit)]++;
  }
  const total = counts.reduce((a, b) => a + b, 0);
  for (const [digit, n] of counts.entries()) {
    const share = n / total;
    assert.ok(
      share > 0.06 && share < 0.14,
      `digit ${digit} appeared ${(share * 100).toFixed(1)}% of the time, which is not uniform`,
    );
  }

  await prisma.loginToken.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
  console.log(
    "sign-in code checks passed: six digits, scoped to one address, single use, expiring, " +
      "independent of the link, survives a resend, and uniformly distributed",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
