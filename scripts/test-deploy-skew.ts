// What happens to somebody who was mid-application when we shipped.
//
// A Next.js server action is addressed by an id minted at build time. Mutuals
// ships several times a day onto two always-on machines, so a page loaded ten
// minutes ago routinely posts an id the running build has never heard of. The
// server refuses it and the throw lands on src/app/error.tsx.
//
// That boundary used to offer `reset()` and nothing else, which re-renders the
// bundle the browser is already holding, which sends the same dead id, which
// fails the same way. "Try again" was a closed loop. On 4 August an applicant
// hit it, pressed the button several times, and stopped applying. Six deploys
// went out that day.
//
// Next does not recover from this on its own (its own guidance for the case is
// to reload the page), so the boundary has to. This pins both halves: that a
// dead action id really does land on the boundary, and that the boundary a
// skewed applicant is handed carries a recovery that fetches a fresh document
// rather than re-running the stale one.

import { randomUUID, createHash, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";

const base = process.env.MEMBER_E2E_BASE_URL || `http://127.0.0.1:${process.env.PORT ?? "3009"}`;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("The deploy-skew checks require an isolated local database.");
}

// A well-formed id from a build that no longer exists: 42 hex characters, the
// shape this version of Next mints. It has to pass the format gate and fail on
// being unknown, because that is the production failure. (An id from before the
// Next 16 upgrade is 40 characters and dies one step earlier, on the format
// check. Same cause, same screen, one fewer thing proven.)
const DEAD_ACTION_ID = "00e11d4c8a2b7f6390d15ab4c7e2f80916bd3a5c7e";

async function main() {
  // The boundary's contract, read from source. The recovery has to be a fresh
  // document: `reset()` is the one action that provably cannot fix this.
  const recovery = readFileSync(new URL("../src/components/Recovery.tsx", import.meta.url), "utf8");
  assert.ok(
    /window\.location\.replace\(/.test(recovery),
    "The recovery must request the page again, so the browser picks up the current build.",
  );
  assert.ok(
    /sessionStorage/.test(recovery),
    "The automatic attempt must be marked, or a genuinely broken page reloads forever.",
  );
  for (const file of ["../src/app/error.tsx", "../src/app/global-error.tsx"]) {
    const boundary = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.ok(
      /useAutoStartOver\(\)/.test(boundary) && /onClick=\{startOver\}/.test(boundary),
      `${file} must take the automatic attempt and offer the same recovery on the button.`,
    );
    assert.ok(
      !/onClick=\{reset\}/.test(boundary),
      `${file} must not wire recovery to reset(): it re-renders the stale bundle and reproduces the error exactly.`,
    );
  }

  const email = `skew-${randomUUID()}@example.test`;
  const person = await prisma.person.create({
    data: { name: "Skew Applicant", email, city: "NYC", status: "applicant" },
  });
  const tok = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      tokenHash: createHash("sha256").update(tok).digest("hex"),
      personId: person.id,
      expiresAt: new Date(Date.now() + 3600e3),
    },
  });
  const cookie = `mc_session=${tok}`;

  try {
    // Once the page has hydrated, React posts the action over fetch with the id
    // in a `next-action` header. That is the path every skew failure in the
    // production logs actually took, and the one that ends on the boundary:
    // Next answers 404 with `x-nextjs-action-not-found`, and the client router
    // turns that header into the throw that replaces the page with the wall.
    const stale = await fetch(`${base}/apply`, {
      method: "POST",
      headers: {
        cookie,
        "next-action": DEAD_ACTION_ID,
        "content-type": "text/plain;charset=UTF-8",
      },
      body: "[]",
      redirect: "manual",
    });
    await stale.text();

    assert.equal(
      stale.headers.get("x-nextjs-action-not-found"),
      "1",
      "A stale action id must be refused with the header the client router reads. If that ever stops being how this fails, the boundary is no longer what catches a skewed applicant and this fix needs revisiting.",
    );
    assert.equal(stale.status, 404, "And refused with a status that is not a success.");

    // It must not have quietly succeeded. A dead id running the action anyway
    // would be a far worse bug than the one being fixed. Nothing was written,
    // so nothing is lost by starting the document over.
    const after = await prisma.person.findUnique({
      where: { id: person.id },
      select: { applicationStep: true },
    });
    assert.equal(
      after?.applicationStep,
      null,
      "A refused action must not half-apply: the step is recorded only when the action actually runs.",
    );

    // The recovery itself: a plain GET of the same address, which is what both
    // the automatic attempt and the button perform. It has to return the
    // application, at the step the row says they reached, and not the wall.
    const recovered = await fetch(`${base}/apply`, { headers: { cookie } });
    const recoveredHtml = await recovered.text();
    assert.equal(recovered.status, 200, "Starting over must return the application.");
    assert.ok(
      !recoveredHtml.includes("Something went sideways."),
      "Starting over must not land on the error boundary again.",
    );
    assert.ok(
      /name="\$ACTION_(ID_|REF_)[^"]*"/.test(recoveredHtml),
      "And it must come back with a live action id from the current build.",
    );
  } finally {
    await prisma.session.deleteMany({ where: { personId: person.id } });
    await prisma.person.delete({ where: { id: person.id } });
    await prisma.$disconnect();
  }

  console.log(
    "deploy-skew checks passed: a stale action id is refused without writing anything, and the boundary hands back a recovery that fetches the current build",
  );
}

main();
