// The forms that must work before React does.
//
// A form driven by useActionState is inert until hydration: pressing the button
// the instant the page paints posts into nothing, and the page just sits there.
// It cost two deploys in CI and it costs real people on slow phones, which are
// exactly the people the application split exists to keep.
//
// A server-action form that the browser can post on its own carries the action
// id in the server-rendered markup. That is the difference, and it is checkable
// without a browser, so this runs in the pure suite.
//
// It does NOT claim the app works with JavaScript disabled. Every page renders
// behind the Suspense fallback in src/app/loading.tsx and Next reveals streamed
// content with an inline script, so with scripting off nobody gets past the
// spinner. What this pins is that the form itself is not the thing standing in
// the way.

import { randomUUID, createHash, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
const base = process.env.MEMBER_E2E_BASE_URL || `http://127.0.0.1:${process.env.PORT ?? "3009"}`;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("The native form checks require an isolated local database.");
}

async function main() {
  const email = `native-${randomUUID()}@example.test`;
  const person = await prisma.person.create({ data: { name: "Native", email, city: "NYC", status: "applicant" } });
  await prisma.photo.create({ data: { personId: person.id, url: `/api/photos/${randomUUID()}.webp`, status: "approved" } });
  const tok = randomBytes(32).toString("base64url");
  await prisma.session.create({ data: { tokenHash: createHash("sha256").update(tok).digest("hex"), personId: person.id, expiresAt: new Date(Date.now() + 3600e3) } });

  const html = await (await fetch(`${base}/apply`, { headers: { cookie: `mc_session=${tok}` } })).text();

  // A server-action form that can be posted by the browser alone carries the
  // action id in the markup. A useActionState form does not: it is inert until
  // React hydrates, which is the bug this is fixing.
  const actionInput = /name="\$ACTION_(ID_|REF_)[^"]*"/.test(html);
  const postsToApply = /<form[^>]+action="\/apply"/.test(html) || /<form[^>]+method="post"/i.test(html);
  assert.ok(
    actionInput,
    "The basics form must carry a server action id so the browser can post it before React hydrates.",
  );
  assert.ok(postsToApply, "And it must be an ordinary form that posts to the page.");

  await prisma.person.delete({ where: { id: person.id } });
  await prisma.$disconnect();
  console.log(
    "native form checks passed: the application's first half carries a server action id and posts without waiting for React",
  );
}
main();
