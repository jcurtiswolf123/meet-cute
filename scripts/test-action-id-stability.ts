// The reason an applicant mid-application survives a deploy.
//
// A Next.js server action is addressed by an id derived at build time from the
// action's module and export, salted with an encryption key. Left to itself
// Next generates that key randomly per build, and the salt is what dominates:
// two builds of byte-identical source produced two completely disjoint sets of
// ids, 58 of 58 changed. Every page anyone was holding broke the moment we
// shipped, which with six deploys in a day is not an edge case. It stranded an
// applicant on 4 August.
//
// Pinning NEXT_SERVER_ACTIONS_ENCRYPTION_KEY makes the ids a function of the
// code alone. Measured with the key pinned: identical across two clean builds,
// across an unrelated file changing, and across src/lib/actions.ts itself
// changing. A page from the previous build posts an id the new build resolves
// and runs.
//
// So the key is load-bearing, and it is load-bearing in a way nothing else
// notices when it breaks: drop it and every deploy still succeeds, every check
// still passes, and applicants quietly start hitting the error boundary again.
// This pins the plumbing that carries it.

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

function main() {
  const dockerfile = read("../Dockerfile");
  assert.ok(
    /--mount=type=secret,id=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY/.test(dockerfile),
    "The build must mount the encryption key as a BuildKit secret. It encrypts bound arguments that cross to the client, so it must not become a build arg or an image layer.",
  );
  assert.ok(
    /export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=/.test(dockerfile),
    "Mounting the secret is not enough: the build has to export it, or Next never sees it and silently falls back to a random key.",
  );

  const workflow = read("../.github/workflows/deploy.yml");
  assert.ok(
    /--build-secret NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=/.test(workflow),
    "The deploy job must pass the encryption key to the build.",
  );
  assert.ok(
    /if \[ -z "\$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY" \]/.test(workflow),
    "The deploy must fail closed when the key is missing. A build without it looks completely healthy and breaks every page that is already open, which is exactly the failure nobody notices until an applicant writes in.",
  );

  // When a build is present and the key was supplied, prove it actually reached
  // Next rather than being dropped somewhere in the plumbing. Next writes the
  // key it used into the manifest, and the running server reads it from there,
  // which is also why there is no runtime env var to keep in sync.
  const configured = process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY;
  const manifestPath = fileURLToPath(
    new URL("../.next/server/server-reference-manifest.json", import.meta.url),
  );
  if (configured && existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      encryptionKey: string;
      node: Record<string, unknown>;
    };
    assert.equal(
      manifest.encryptionKey,
      configured,
      "The build did not use the key it was given, so action ids are random again and every open page will break on the next deploy.",
    );
    assert.ok(
      Object.keys(manifest.node).length > 0,
      "A build with no server actions at all means this check is measuring nothing.",
    );
    console.log(
      `action id stability checks passed: the key is carried end to end and pinned ${Object.keys(manifest.node).length} action ids in this build`,
    );
    return;
  }

  console.log(
    "action id stability checks passed: the key is wired through the Dockerfile and the deploy job, and the deploy refuses to run without it (no build present to check the manifest against)",
  );
}

main();
