// Always-on watchdog worker.
//
// Every cycle it checks the things that actually break a deploy or the live
// site, records status, and alerts on failure. When WATCHDOG_AUTOFIX=1 and an
// Anthropic key is present, a typecheck regression triggers an AI fix attempt
// that is committed to a NEW branch and (if `gh` is available) opened as a PR.
// It NEVER edits the working branch or touches production.
//
//   npm run watchdog                 # run forever (default 5 min interval)
//   WATCHDOG_ONCE=1 npm run watchdog # single pass (CI / cron)
//   WATCHDOG_AUTOFIX=1 npm run watchdog
//
// Tunables: WATCHDOG_INTERVAL_MS, WATCHDOG_URL, WATCHDOG_BUILD_EVERY,
// WATCHDOG_ALERT_EMAIL, ANTHROPIC_API_KEY, WATCHDOG_AUTOFIX.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { sendEmail } from "../src/lib/email";

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, ".watchdog");
const INTERVAL_MS = Number(process.env.WATCHDOG_INTERVAL_MS) || 5 * 60 * 1000;
const URL = (process.env.WATCHDOG_URL || "https://meet-cute.fly.dev").replace(/\/$/, "");
const BUILD_EVERY = Number(process.env.WATCHDOG_BUILD_EVERY) || 12; // ~hourly at 5m
const ALERT_EMAIL = process.env.WATCHDOG_ALERT_EMAIL || process.env.RESEND_REPLY_TO || "";
const AUTOFIX = process.env.WATCHDOG_AUTOFIX === "1";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

type Check = { name: string; ok: boolean; detail: string };

function log(line: string) {
  const stamp = new Date().toISOString();
  console.log(`[watchdog ${stamp}] ${line}`);
  try {
    mkdirSync(OUT_DIR, { recursive: true });
    appendFileSync(join(OUT_DIR, "log.ndjson"), JSON.stringify({ t: stamp, line }) + "\n");
  } catch {
    /* logging is best-effort */
  }
}

function run(cmd: string, args: string[], timeoutMs = 240_000): { ok: boolean; out: string } {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  return { ok: r.status === 0, out };
}

async function checkHealth(): Promise<Check> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(`${URL}/`, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(timer);
    return { name: "health", ok: res.ok, detail: `${URL}/ -> ${res.status}` };
  } catch (e) {
    return { name: "health", ok: false, detail: `${URL}/ unreachable: ${(e as Error).message}` };
  }
}

function checkTypecheck(): Check {
  const r = run("npx", ["tsc", "--noEmit"]);
  return { name: "typecheck", ok: r.ok, detail: r.ok ? "clean" : r.out.slice(-4000) };
}

function checkBuild(): Check {
  const r = run("npm", ["run", "build"]);
  return { name: "build", ok: r.ok, detail: r.ok ? "ok" : r.out.slice(-4000) };
}

async function checkDb(): Promise<Check> {
  if (!process.env.DATABASE_URL) return { name: "db", ok: true, detail: "skipped (no DATABASE_URL)" };
  try {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$queryRawUnsafe("SELECT 1");
    return { name: "db", ok: true, detail: "reachable" };
  } catch (e) {
    return { name: "db", ok: false, detail: `db error: ${(e as Error).message}` };
  }
}

async function alert(failed: Check[]) {
  const body = failed.map((c) => `- ${c.name}: ${c.detail}`).join("\n");
  log(`ALERT: ${failed.map((c) => c.name).join(", ")} failing`);
  if (ALERT_EMAIL) {
    await sendEmail({
      to: ALERT_EMAIL,
      subject: `[Meet Cute watchdog] ${failed.map((c) => c.name).join(", ")} failing`,
      text: `Watchdog detected failures at ${new Date().toISOString()}:\n\n${body}\n\nApp: ${URL}`,
      html: `<p>Watchdog detected failures at ${new Date().toISOString()}:</p><pre>${body}</pre><p>App: ${URL}</p>`,
    }).catch(() => {});
  }
}

// --- guarded AI auto-fix -----------------------------------------------------

function filesFromTsc(out: string): string[] {
  const set = new Set<string>();
  // tsc lines look like: src/foo/bar.ts(12,3): error TS...
  for (const m of out.matchAll(/^(.+?\.tsx?)\(\d+,\d+\):/gm)) set.add(m[1].trim());
  return [...set].slice(0, 4);
}

async function attemptAutofix(tscOut: string): Promise<void> {
  if (!AUTOFIX || !ANTHROPIC_KEY) return;
  const files = filesFromTsc(tscOut);
  if (!files.length) {
    log("autofix: could not identify offending files; skipping");
    return;
  }
  log(`autofix: attempting fix for ${files.join(", ")}`);

  const fs = await import("node:fs/promises");
  const current: { path: string; content: string }[] = [];
  for (const f of files) {
    try {
      current.push({ path: f, content: await fs.readFile(join(ROOT, f), "utf8") });
    } catch {
      /* skip unreadable */
    }
  }
  if (!current.length) return;

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });
  const prompt = [
    "You are fixing TypeScript compile errors in a Next.js + Prisma project.",
    "Make the MINIMAL change needed to fix the errors. Do not refactor or change behavior.",
    "Return ONLY a JSON object: { \"files\": [ { \"path\": string, \"content\": string } ] } with the FULL new content of each file you change.",
    "",
    "=== tsc errors ===",
    tscOut.slice(-3000),
    "",
    ...current.map((f) => `=== FILE: ${f.path} ===\n${f.content}`),
  ].join("\n");

  let proposed: { path: string; content: string }[] = [];
  try {
    const res = await anthropic.messages.create({
      model: process.env.COPILOT_TOOLS_MODEL || "claude-sonnet-4-6",
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    proposed = (JSON.parse(json).files ?? []).filter(
      (f: { path: string }) => files.includes(f.path), // only files we offered
    );
  } catch (e) {
    log(`autofix: model/parse error: ${(e as Error).message}`);
    return;
  }
  if (!proposed.length) {
    log("autofix: model returned no usable patch");
    return;
  }

  // Work on a throwaway branch so master/working branch is never touched.
  const branch = `watchdog/fix-${Date.now()}`;
  const baseRef = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]).out || "HEAD";
  if (!run("git", ["checkout", "-b", branch]).ok) {
    log("autofix: could not create branch; aborting");
    return;
  }
  try {
    for (const f of proposed) await fs.writeFile(join(ROOT, f.path), f.content, "utf8");
    const verify = checkTypecheck();
    if (!verify.ok) {
      log("autofix: patch did not resolve typecheck; discarding");
      run("git", ["checkout", "--", "."]);
      run("git", ["checkout", baseRef]);
      run("git", ["branch", "-D", branch]);
      return;
    }
    run("git", ["add", ...proposed.map((f) => f.path)]);
    run("git", ["commit", "-m", `fix(watchdog): auto-fix typecheck regression in ${proposed.map((f) => f.path).join(", ")}`]);
    const pushed = run("git", ["push", "-u", "origin", branch]);
    if (pushed.ok) {
      const pr = run("gh", ["pr", "create", "--fill", "--head", branch, "--base", baseRef]);
      log(pr.ok ? `autofix: opened PR for ${branch}` : `autofix: pushed ${branch} (open a PR manually: ${pr.out.slice(-200)})`);
    } else {
      log(`autofix: committed to ${branch} locally (push failed: ${pushed.out.slice(-200)})`);
    }
  } finally {
    // Always return to the original branch; never leave the worker on the fix branch.
    run("git", ["checkout", baseRef]);
  }
}

async function cycle(n: number): Promise<boolean> {
  const checks: Check[] = [];
  checks.push(await checkHealth());
  checks.push(await checkDb());
  const tc = checkTypecheck();
  checks.push(tc);
  if (n % BUILD_EVERY === 0) checks.push(checkBuild());

  const failed = checks.filter((c) => !c.ok);
  const status = { at: new Date().toISOString(), cycle: n, ok: failed.length === 0, checks };
  try {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, "status.json"), JSON.stringify(status, null, 2));
  } catch {
    /* best-effort */
  }

  if (failed.length) {
    await alert(failed);
    if (!tc.ok) await attemptAutofix(tc.detail);
  } else {
    log(`all green (${checks.map((c) => c.name).join(", ")})`);
  }
  return failed.length === 0;
}

(async () => {
  log(`starting. url=${URL} interval=${INTERVAL_MS}ms autofix=${AUTOFIX} once=${process.env.WATCHDOG_ONCE === "1"}`);
  let n = 0;
  if (process.env.WATCHDOG_ONCE === "1") {
    const ok = await cycle(0);
    process.exitCode = ok ? 0 : 1; // non-zero so CI / cron flags failures
    return;
  }
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await cycle(n++).catch((e) => log(`cycle error: ${(e as Error).message}`));
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
})();
