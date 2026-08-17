// Assert what production is actually serving, after it has been deployed.
//
// The guard in deploy-guard.ts answers two questions before a deploy: is this
// the code we think it is, and does it contain what is already live. Neither
// question catches the third thing that went wrong on 2026-08-16: a regression
// that rides in on a legitimate forward deploy. The display font had been
// silently reverting to a serif on every deploy from master for a day, and
// three sessions read the shipped HTML that evening without seeing it, because
// each of us grepped for the thing we already suspected. Grepping for what you
// suspect is a confirmation, not a check.
//
// So this compares the whole of a small surface against what the repo says it
// should be, and fails on any difference, including one nobody thought to look
// for. It runs as `postdeploy`, so `npm run deploy` ends with it.
//
// Deliberately unauthenticated: no session to mint, no secret to hold, so it
// runs anywhere, including from CI or a cron. That bounds what it can see, and
// the signed-in studio is checked separately by the e2e suites.
//
//   npm run deploy                     guard, deploy, then this
//   npm run deploy:check               this alone, against production
//   BASE=https://meet-cute.fly.dev npm run deploy:check
//   DEPLOY_CHECK_COMMIT=<sha>          override the commit it expects
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BASE = (process.env.BASE || "https://hellomutuals.com").replace(/\/$/, "");
const TIMEOUT_MS = 20_000;
// A deploy releases two machines in sequence, so the commit can lag for a few
// seconds after flyctl returns. Everything else is asserted only once the
// commit matches, so a slow rollout reads as slow rather than as broken.
const COMMIT_WAIT_MS = Number(process.env.DEPLOY_CHECK_WAIT_MS || 120_000);

type Failure = { what: string; expected: string; actual: string };
const failures: Failure[] = [];
const passes: string[] = [];

function fail(what: string, expected: string, actual: string) {
  failures.push({ what, expected, actual });
}
function pass(what: string, detail?: string) {
  passes.push(detail ? `${what} (${detail})` : what);
}

async function get(path: string): Promise<{ status: number; body: string; type: string }> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "mutuals-deploy-check" },
    });
    return {
      status: res.status,
      body: await res.text(),
      type: res.headers.get("content-type") || "",
    };
  } catch (e) {
    return { status: 0, body: `(${(e as Error).message})`, type: "" };
  }
}

/** The fonts the repo says the site loads, from the one import that decides it. */
function expectedFonts(): string[] {
  const src = readFileSync("src/app/layout.tsx", "utf8");
  const line = src.match(/import\s*\{([^}]+)\}\s*from\s*["']next\/font\/google["']/);
  if (!line) throw new Error("could not find the next/font/google import in src/app/layout.tsx");
  return line[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.toLowerCase())
    .sort();
}

/** The fonts production actually loads, from the root element's class list. */
function servedFonts(html: string): string[] {
  const cls = html.match(/<html[^>]*\sclass="([^"]*)"/)?.[1] || "";
  const found = new Set<string>();
  for (const token of cls.split(/\s+/)) {
    const m = token.match(/^(.+?)_[0-9a-f]{8}-module__/);
    if (m) found.add(m[1].toLowerCase());
  }
  return [...found].sort();
}

async function waitForCommit(want: string): Promise<string | null> {
  const deadline = Date.now() + COMMIT_WAIT_MS;
  let last = "";
  for (;;) {
    const res = await get("/healthz");
    try {
      const body = JSON.parse(res.body) as { commit?: string | null };
      last = body.commit || "";
      if (last === want) return last;
    } catch {
      last = `(unparseable: ${res.body.slice(0, 60)})`;
    }
    if (Date.now() >= deadline) return last || null;
    await new Promise((r) => setTimeout(r, 5_000));
  }
}

async function main() {
  const want =
    process.env.DEPLOY_CHECK_COMMIT ||
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

  console.log(`deploy-check: ${BASE}, expecting ${want.slice(0, 7)}`);

  // 1. The right code is running. Everything below is only meaningful once
  //    this holds, so it waits rather than racing the rollout.
  const live = await waitForCommit(want);
  if (live !== want) {
    fail("running commit", want, live || "(none reported)");
    console.error(
      "deploy-check: production is not serving this commit, so nothing else is worth asserting.",
    );
    report();
    return;
  }
  pass("running commit", want.slice(0, 7));

  // 2. The fonts, derived from the source rather than hard-coded, so a change
  //    in the tree that does not reach production is a failure by itself. This
  //    is the check the serif regression needed and did not have.
  const home = await get("/");
  if (home.status !== 200) {
    fail("GET /", "200", String(home.status));
  } else {
    const want_ = expectedFonts();
    const got = servedFonts(home.body);
    if (want_.join(",") !== got.join(",")) {
      fail("fonts on the public page", want_.join(", ") || "(none)", got.join(", ") || "(none)");
    } else {
      pass("fonts", got.join(", "));
    }
  }

  // 3. The installable app. A 404 here is what a lost PWA looked like.
  const manifest = await get("/manifest.webmanifest");
  if (manifest.status !== 200) {
    fail("GET /manifest.webmanifest", "200", String(manifest.status));
  } else if (!manifest.type.includes("manifest+json") && !manifest.type.includes("json")) {
    fail("manifest content type", "application/manifest+json", manifest.type || "(none)");
  } else {
    try {
      const m = JSON.parse(manifest.body) as { name?: string; start_url?: string; display?: string };
      if (m.name !== "Mutuals" || m.start_url !== "/app" || m.display !== "standalone") {
        fail(
          "manifest contents",
          'name "Mutuals", start_url /app, display standalone',
          `name ${m.name}, start_url ${m.start_url}, display ${m.display}`,
        );
      } else {
        pass("manifest", `${m.name}, ${m.start_url}, ${m.display}`);
      }
    } catch {
      fail("manifest parses", "JSON", manifest.body.slice(0, 60));
    }
  }

  for (const path of ["/sw.js", "/offline.html"]) {
    const r = await get(path);
    // A missing file here answers with the app's 404 page, which has been a
    // 200 in the past, so the body has to be looked at rather than the status.
    const isHtml404 = r.body.includes("We couldn") && r.body.includes("404");
    if (r.status !== 200 || isHtml404) {
      fail(`GET ${path}`, "the file", isHtml404 ? "the 404 page" : String(r.status));
    } else {
      pass(`GET ${path}`);
    }
  }

  // 4. The iOS shell's half of the contract. The shell asks for session before
  //    it draws anything, and code is the only way into an installed app.
  const mobile: [string, (r: { status: number }) => boolean, string][] = [
    ["/api/mobile/session", (r) => r.status === 200, "200"],
    ["/api/mobile/login", (r) => r.status !== 404, "not 404"],
    ["/api/mobile/logout", (r) => r.status !== 404, "not 404"],
    ["/api/mobile/code", (r) => r.status !== 404, "not 404"],
    // The demo route mints a session for an arbitrary member with no
    // credentials. It is gated to non-production, and this asserts the gate
    // holds rather than assuming it.
    ["/api/mobile/demo", (r) => r.status === 404, "404, the gate holds"],
  ];
  for (const [path, ok, expected] of mobile) {
    const r = await get(path);
    if (ok(r)) pass(`GET ${path}`, expected);
    else fail(`GET ${path}`, expected, String(r.status));
  }

  // 5. The public surface. Cheap, and a 500 on any of them is a bad deploy
  //    whatever else is true.
  for (const path of [
    "/",
    "/apply",
    "/refer",
    "/dinners",
    "/coaching",
    "/login",
    "/privacy",
    "/terms",
    "/sms-opt-in",
  ]) {
    const r = await get(path);
    if (r.status === 200) pass(`GET ${path}`);
    else fail(`GET ${path}`, "200", String(r.status));
  }

  // 6. The studio is behind sign-in, and a signed-out response must carry no
  //    member. Person links are the tell: the directory renders one per row.
  const studio = await get("/studio");
  if (studio.body.includes("/studio/person/")) {
    fail("signed-out /studio", "no member rows", "person links present");
  } else {
    pass("signed-out /studio carries no roster");
  }

  report();
}

function report() {
  console.log(`deploy-check: ${passes.length} passed`);
  if (!failures.length) {
    console.log("deploy-check: production matches the repo.");
    return;
  }
  console.error(`\ndeploy-check: ${failures.length} FAILED\n`);
  for (const f of failures) {
    console.error(`  ${f.what}\n    expected: ${f.expected}\n    actual:   ${f.actual}`);
  }
  console.error(
    "\n  A forward deploy can still take something out. If this is a deliberate change,\n" +
      "  change what it asserts in the same commit that changes the behaviour.",
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
