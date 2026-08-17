// Refuse a deploy that would roll production backwards.
//
// This repo deploys from whichever branch holds the work, not always from
// master, and on 2026-08-16 that cost a day: the studio streamline and the PWA
// shipped as v225, then four deploys landed from `session/ios`, a branch cut
// before them, and production quietly lost both. Nothing failed, no test broke,
// and the only symptom was a studio that looked like yesterday's.
//
// The check: ask production which commit it is serving (/healthz reports the
// NEXT_DEPLOYMENT_ID baked into its image) and refuse unless that commit is an
// ancestor of HEAD. Deploying strictly forward is allowed; deploying something
// that does not contain what is already live is not.
//
// Escape hatches, both deliberate and both loud:
//   DEPLOY_ALLOW_ROLLBACK=1   a real rollback to a known-good release
//   production reports no commit / is unreachable   warns, does not block
import { execFileSync } from "node:child_process";

const ORIGIN = process.env.DEPLOY_HEALTH_URL || "https://hellomutuals.com/healthz";

function git(...args: string[]) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

async function main() {
  const head = git("rev-parse", "HEAD");

  if (process.env.DEPLOY_ALLOW_ROLLBACK === "1") {
    console.log(`deploy-guard: DEPLOY_ALLOW_ROLLBACK=1, skipping the ancestry check (HEAD ${head.slice(0, 7)}).`);
    return;
  }

  let live: string | null = null;
  try {
    const res = await fetch(ORIGIN, { signal: AbortSignal.timeout(15_000) });
    const body = (await res.json()) as { commit?: string | null };
    live = body.commit ?? null;
  } catch (e) {
    console.warn(`deploy-guard: could not reach ${ORIGIN} (${(e as Error).message}). Not blocking.`);
    return;
  }

  if (!live) {
    console.warn(
      "deploy-guard: production reports no commit. It predates this check, or was deployed without " +
        "NEXT_DEPLOYMENT_ID. Not blocking, but this deploy is unverified against what is live.",
    );
    return;
  }

  if (live === head) {
    console.log(`deploy-guard: production is already on ${head.slice(0, 7)}. Redeploying the same commit.`);
    return;
  }

  let known = true;
  try {
    git("cat-file", "-e", `${live}^{commit}`);
  } catch {
    known = false;
  }

  if (!known) {
    console.error(
      `deploy-guard: production is serving ${live.slice(0, 12)}, which this checkout does not have.\n` +
        "  Fetch it first (git fetch --all), then deploy from a branch that contains it.\n" +
        "  If you mean to roll back on purpose: DEPLOY_ALLOW_ROLLBACK=1 npm run deploy",
    );
    process.exit(1);
  }

  let contains = true;
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", live, head], { stdio: "ignore" });
  } catch {
    contains = false;
  }

  if (!contains) {
    const missing = git("log", "--oneline", `${head}..${live}`);
    console.error(
      `deploy-guard: this would roll production back.\n` +
        `  live: ${live.slice(0, 12)}\n` +
        `  HEAD: ${head.slice(0, 12)} (${git("rev-parse", "--abbrev-ref", "HEAD")})\n` +
        `  HEAD is missing ${missing.split("\n").length} commit(s) that are live now:\n` +
        missing
          .split("\n")
          .map((l) => `    ${l}`)
          .join("\n") +
        `\n  Merge or rebase onto what is live, then deploy.\n` +
        `  If you mean to roll back on purpose: DEPLOY_ALLOW_ROLLBACK=1 npm run deploy`,
    );
    process.exit(1);
  }

  const ahead = git("rev-list", "--count", `${live}..${head}`);
  console.log(`deploy-guard: forward-only. ${ahead} commit(s) ahead of live ${live.slice(0, 7)}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
