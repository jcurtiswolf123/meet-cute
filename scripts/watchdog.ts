// Always-on watchdog worker.
//
// Every cycle it checks the things that actually break a deploy or the live
// site, records status, and alerts on failure. When WATCHDOG_AUTOFIX=1 and an AI
// key is present (ANTHROPIC_API_KEY, NVIDIA_API_KEY or OPENAI_API_KEY), a
// typecheck regression triggers an AI fix attempt that is committed to a NEW
// branch and (if `gh` is available) opened as a PR. It NEVER edits the working
// branch or touches prod.
//
//   npm run watchdog                 # run forever (default 5 min interval)
//   WATCHDOG_ONCE=1 npm run watchdog # single pass (CI / cron)
//   WATCHDOG_AUTOFIX=1 npm run watchdog
//
// Tunables: WATCHDOG_INTERVAL_MS, WATCHDOG_URL, WATCHDOG_BUILD_EVERY,
// WATCHDOG_SKIP_BUILD, WATCHDOG_ALERT_EMAIL, ANTHROPIC_API_KEY,
// NVIDIA_API_KEY, WATCHDOG_AUTOFIX.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { sendEmail } from "../src/lib/email";

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, ".watchdog");
const INTERVAL_MS = Number(process.env.WATCHDOG_INTERVAL_MS) || 5 * 60 * 1000;
const URL = (process.env.WATCHDOG_URL || "https://hellomutuals.com").replace(/\/$/, "");
/** How far back a permanently-failed delivery still counts as an active alarm. */
const RECENT_FAILURE_WINDOW_MS =
  Number(process.env.WATCHDOG_FAILURE_WINDOW_MS) || 24 * 60 * 60 * 1000;
const BUILD_EVERY = Number(process.env.WATCHDOG_BUILD_EVERY) || 12; // ~hourly at 5m
const SKIP_BUILD = process.env.WATCHDOG_SKIP_BUILD === "1";
const ALERT_EMAIL = process.env.WATCHDOG_ALERT_EMAIL || process.env.RESEND_REPLY_TO || "";
const AUTOFIX = process.env.WATCHDOG_AUTOFIX === "1";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const NVIDIA_KEY = process.env.NVIDIA_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

// Ask whichever AI providers are configured for a minimal patch, in order,
// falling through on failure. Returns the raw model text (expected to contain
// the JSON patch object). NVIDIA sits ahead of OpenAI because it is the funded
// provider; before this, an unfunded OpenAI key silently made autofix a no-op
// while the workflow still reported success.
async function askForPatch(prompt: string): Promise<string> {
  const attempts: { label: string; run: () => Promise<string> }[] = [];

  if (ANTHROPIC_KEY) {
    attempts.push({
      label: "Anthropic",
      run: async () => {
        const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });
        const res = await anthropic.messages.create({
          model: process.env.COPILOT_TOOLS_MODEL || "claude-sonnet-4-6",
          max_tokens: 8000,
          messages: [{ role: "user", content: prompt }],
        });
        return res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
      },
    });
  }

  // A patch is a reasoning task with no latency pressure, so this uses the big
  // free NIM model rather than the co-pilot's interactive one.
  if (NVIDIA_KEY) {
    attempts.push({
      label: "NVIDIA",
      run: async () => {
        const nvidia = new OpenAI({
          apiKey: NVIDIA_KEY,
          baseURL: "https://integrate.api.nvidia.com/v1",
          timeout: 180_000,
          maxRetries: 1,
        });
        const res = await nvidia.chat.completions.create({
          model: process.env.WATCHDOG_NVIDIA_MODEL || "nvidia/llama-3.3-nemotron-super-49b-v1.5",
          max_tokens: 8000,
          messages: [{ role: "user", content: prompt }],
        });
        return res.choices[0]?.message?.content ?? "";
      },
    });
  }

  if (OPENAI_KEY) {
    attempts.push({
      label: "OpenAI",
      run: async () => {
        const openai = new OpenAI({ apiKey: OPENAI_KEY });
        const res = await openai.chat.completions.create({
          model: process.env.COPILOT_OPENAI_MODEL || "gpt-4o-mini",
          max_tokens: 8000,
          messages: [{ role: "user", content: prompt }],
        });
        return res.choices[0]?.message?.content ?? "";
      },
    });
  }

  for (const attempt of attempts) {
    try {
      const out = await attempt.run();
      if (out.trim()) return out;
      log(`autofix: ${attempt.label} returned nothing, trying the next provider`);
    } catch (e) {
      log(`autofix: ${attempt.label} failed (${(e as Error).message}), trying the next provider`);
    }
  }
  if (!attempts.length) log("autofix: no AI provider key configured, skipping");
  return "";
}

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

async function checkReadiness(): Promise<Check> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(`${URL}/readyz`, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(timer);
    return { name: "readiness", ok: res.ok, detail: `${URL}/readyz -> ${res.status}` };
  } catch (e) {
    return { name: "readiness", ok: false, detail: `${URL}/readyz unreachable: ${(e as Error).message}` };
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

// Pull recent unresolved Sentry issues so live runtime errors show up in the
// watchdog status + alerts alongside the build/typecheck checks. Informational:
// having issues is not itself a "failed check" (it never blocks), but they are
// surfaced so a human (or Sentry Seer's AI autofix, enabled in the Sentry UI)
// can act. No-op unless SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT are set.
async function checkSentry(): Promise<Check | null> {
  const token = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;
  if (!token || !org || !project) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(
      `https://sentry.io/api/0/projects/${org}/${project}/issues/?query=${encodeURIComponent("is:unresolved")}&statsPeriod=24h`,
      { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal, cache: "no-store" }
    );
    clearTimeout(timer);
    if (!res.ok) return { name: "sentry", ok: true, detail: `issues API ${res.status} (skipped)` };
    const issues = (await res.json()) as { title?: string; culprit?: string; count?: string }[];
    if (!Array.isArray(issues) || issues.length === 0) return { name: "sentry", ok: true, detail: "no unresolved issues (24h)" };
    const top = issues.slice(0, 5).map((i) => `${i.title ?? "issue"}${i.culprit ? ` @ ${i.culprit}` : ""} (${i.count ?? "?"})`);
    return { name: "sentry", ok: true, detail: `${issues.length} unresolved (24h): ${top.join(" | ")}` };
  } catch (e) {
    return { name: "sentry", ok: true, detail: `issues check error: ${(e as Error).message}` };
  }
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

async function checkDeliveryQueue(): Promise<Check> {
  if (!process.env.DATABASE_URL) {
    return { name: "delivery", ok: true, detail: "skipped (no DATABASE_URL)" };
  }
  try {
    const { prisma } = await import("../src/lib/prisma");
    // Only recent failures are actionable. Counting every failure ever recorded
    // means one permanently-failed job pins this red until a human goes and
    // deletes the row, and an alarm that is always on is an alarm nobody reads.
    // A QA send that failed on 2026-07-24 alerted every 15 minutes for a week
    // and taught exactly that lesson.
    const since = new Date(Date.now() - RECENT_FAILURE_WINDOW_MS);
    const [failed, olderFailed, staleProcessing] = await Promise.all([
      prisma.deliveryJob.count({ where: { status: "failed", updatedAt: { gte: since } } }),
      prisma.deliveryJob.count({ where: { status: "failed", updatedAt: { lt: since } } }),
      prisma.deliveryJob.count({
        where: {
          status: "processing",
          lockedAt: { lt: new Date(Date.now() - 5 * 60_000) },
        },
      }),
    ]);
    const ok = failed === 0 && staleProcessing === 0;
    const olderNote = olderFailed > 0 ? `, ${olderFailed} older (not alerting)` : "";
    return {
      name: "delivery",
      ok,
      detail: `${failed} failed in the last ${RECENT_FAILURE_WINDOW_MS / 3_600_000}h${olderNote}, ${staleProcessing} stale processing`,
    };
  } catch (e) {
    return { name: "delivery", ok: false, detail: `queue check error: ${(e as Error).message}` };
  }
}

/**
 * The reply-by-email path depends on one URL that lives only in Resend, and it
 * was wrong for eleven days without anything noticing.
 *
 * The webhook was still pointed at hellomeetcute.com after the rename. The app
 * 308-redirects that host to the canonical one, and svix does not follow 3xx,
 * so every `email.received` event was recorded as a failed delivery and no
 * member's "Y" reply reached the app. There is no app-side error to capture
 * when a webhook never arrives: Sentry was clean, the health checks were green,
 * and the only symptom was a match that stayed at mutual_yes.
 *
 * So assert it from the outside. A webhook endpoint that does not sit on the
 * canonical host is a failure, whatever the rest of the system says.
 */
async function checkInboundWebhook(): Promise<Check | null> {
  const key = process.env.RESEND_API_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || URL;
  // This module shadows the global `URL` with the site address, so the WHATWG
  // constructor is not reachable by that name here.
  const hostOf = (u: string) => new globalThis.URL(u).host;
  if (!key) return { name: "inbound-webhook", ok: true, detail: "skipped (no RESEND_API_KEY)" };

  try {
    const res = await fetch("https://api.resend.com/webhooks", {
      signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    if (!res.ok) {
      return { name: "inbound-webhook", ok: true, detail: `skipped (Resend returned ${res.status})` };
    }
    const body = (await res.json()) as { data?: { status?: string; endpoint?: string; events?: string[] }[] };
    const rows = body.data ?? [];

    // Only our own inbound endpoint. This Resend account is shared with other
    // projects, whose webhooks point at their own hosts and are none of our
    // business.
    const ours = rows.filter((w) => (w.endpoint ?? "").includes("/api/email/inbound"));
    if (!ours.length) {
      return { name: "inbound-webhook", ok: false, detail: "no email.received webhook for /api/email/inbound is registered" };
    }

    const expectedHost = hostOf(appUrl);
    const wrong = ours.filter((w) => {
      if (w.status !== "enabled") return false;
      try {
        return hostOf(w.endpoint!) !== expectedHost;
      } catch {
        return true;
      }
    });
    if (wrong.length) {
      return {
        name: "inbound-webhook",
        ok: false,
        detail: `points at ${wrong.map((w) => w.endpoint).join(", ")} but the canonical host is ${expectedHost}; a redirect there silently drops every Y/N reply`,
      };
    }
    const enabled = ours.filter((w) => w.status === "enabled");
    if (!enabled.length) {
      return { name: "inbound-webhook", ok: false, detail: "the inbound webhook exists but is disabled" };
    }
    return { name: "inbound-webhook", ok: true, detail: `enabled at ${enabled[0].endpoint}` };
  } catch (e) {
    return { name: "inbound-webhook", ok: true, detail: `skipped (${(e as Error).message})` };
  }
}

/**
 * Date ideas switch themselves off silently.
 *
 * A venue is eligible only while active AND verified inside VENUE_FRESH_DAYS,
 * so the ideas block in the connection email disappears on its own the day the
 * last stamp expires. That is the right safe default and it is also invisible:
 * the email still sends, nothing errors, and the only signal is that two people
 * stopped being told where to go. Verification expiring is a scheduled event,
 * so it should be an alert rather than a discovery.
 */
async function checkVenueFreshness(): Promise<Check | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const { prisma } = await import("../src/lib/prisma");
    const { VENUE_FRESH_DAYS } = await import("../src/lib/date-ideas");
    const cutoff = new Date(Date.now() - VENUE_FRESH_DAYS * 24 * 3600 * 1000);

    const counts = await Promise.all(
      ["NYC", "SF"].map(async (city) => ({
        city,
        eligible: await prisma.venue.count({
          where: { city, active: true, lastVerifiedAt: { gte: cutoff } },
        }),
      })),
    );

    // Expiring inside a fortnight, so there is time to re-check before the
    // suggestion quietly vanishes.
    const soon = new Date(Date.now() - (VENUE_FRESH_DAYS - 14) * 24 * 3600 * 1000);
    const expiringSoon = await prisma.venue.count({
      where: { active: true, lastVerifiedAt: { gte: cutoff, lt: soon } },
    });

    const empty = counts.filter((c) => c.eligible === 0).map((c) => c.city);
    const summary =
      counts.map((c) => `${c.city}=${c.eligible}`).join(" ") +
      (expiringSoon ? `, ${expiringSoon} expiring within 14d` : "");

    if (empty.length) {
      return {
        name: "venues",
        ok: false,
        detail: `no eligible venue in ${empty.join(" or ")}, so connection emails there carry no ideas (${summary})`,
      };
    }
    return { name: "venues", ok: true, detail: summary };
  } catch (e) {
    return { name: "venues", ok: true, detail: `skipped (${(e as Error).message})` };
  }
}

async function alert(failed: Check[]) {
  const body = failed.map((c) => `- ${c.name}: ${c.detail}`).join("\n");
  log(`ALERT: ${failed.map((c) => c.name).join(", ")} failing`);
  if (ALERT_EMAIL) {
    await sendEmail({
      to: ALERT_EMAIL,
      subject: `[Mutuals watchdog] ${failed.map((c) => c.name).join(", ")} failing`,
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

/** Pull `<<<FILE path` / `>>>END` blocks out of a model reply.
 *
 *  Exported so it can be tested without a live model. Only paths in `allowed`
 *  survive, so a model cannot rewrite a file it was never shown, and the last
 *  block wins if a path repeats. */
export function parsePatch(raw: string, allowed: string[]): { path: string; content: string }[] {
  const out = new Map<string, string>();
  // Non-greedy body, and the terminator must start its own line so a string
  // containing ">>>END" inside the file cannot end the block early.
  const re = /<<<FILE[ \t]+(\S+)[ \t]*\r?\n([\s\S]*?)\r?\n>>>END/g;
  for (const m of raw.matchAll(re)) {
    const path = m[1].trim();
    if (!allowed.includes(path)) continue;
    // Models sometimes wrap the body in a fence despite being told not to.
    let body = m[2];
    const fence = body.match(/^```[a-z]*\r?\n([\s\S]*)\r?\n```$/);
    if (fence) body = fence[1];
    if (body.trim()) out.set(path, body.endsWith("\n") ? body : `${body}\n`);
  }
  return [...out].map(([path, content]) => ({ path, content }));
}

async function attemptAutofix(tscOut: string): Promise<void> {
  // NVIDIA belongs here too. `askForPatch` learned about it when the co-pilot
  // did, and this gate did not, so on a box with only a NVIDIA key autofix would
  // have skipped without ever saying why.
  if (!AUTOFIX) return;
  if (!ANTHROPIC_KEY && !NVIDIA_KEY && !OPENAI_KEY) {
    log("autofix: enabled but no AI provider key is set; skipping");
    return;
  }
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

  // Deliberately NOT JSON. The first version asked for
  // {"files":[{"path","content"}]} with whole source files inside JSON strings,
  // and it never once succeeded: real code is full of backslashes, quotes and
  // newlines, and models get the escaping wrong. The first live drill died on
  // "Bad escaped character in JSON at position 875".
  //
  // Delimited blocks need no escaping at all, so the content round-trips
  // verbatim and parsing is a string split rather than a parser that can reject
  // an otherwise good patch.
  const prompt = [
    "You are fixing TypeScript compile errors in a Next.js + Prisma project.",
    "Make the MINIMAL change needed to fix the errors. Do not refactor and do not change behaviour.",
    "",
    "Reply with the FULL new content of each file you change, in exactly this form:",
    "",
    "<<<FILE path/to/file.ts",
    "...the entire file...",
    ">>>END",
    "",
    "No prose, no markdown fences, no commentary. Only files listed below may appear.",
    "",
    "=== tsc errors ===",
    tscOut.slice(-3000),
    "",
    ...current.map((f) => `<<<FILE ${f.path}\n${f.content}\n>>>END`),
  ].join("\n");

  let proposed: { path: string; content: string }[] = [];
  try {
    proposed = parsePatch(await askForPatch(prompt), files);
  } catch (e) {
    log(`autofix: model error: ${(e as Error).message}`);
    return;
  }
  if (!proposed.length) {
    log("autofix: model returned no usable patch");
    return;
  }
  log(`autofix: model proposed changes to ${proposed.map((f) => f.path).join(", ")}`);

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
  checks.push(await checkReadiness());
  checks.push(await checkDb());
  checks.push(await checkDeliveryQueue());
  {
    const webhook = await checkInboundWebhook();
    if (webhook) checks.push(webhook);
  }
  {
    const venues = await checkVenueFreshness();
    if (venues) checks.push(venues);
  }
  const sentry = await checkSentry();
  if (sentry) {
    checks.push(sentry);
    log(`sentry: ${sentry.detail}`);
  }
  const tc = checkTypecheck();
  checks.push(tc);
  if (!SKIP_BUILD && n % BUILD_EVERY === 0) checks.push(checkBuild());

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

// Only run the worker when this file IS the program. `parsePatch` is exported
// for tests, and importing it used to start the watchdog: the test process sat
// in the 5-minute polling loop instead of asserting anything.
const isEntry = process.argv[1] ? resolve(process.argv[1]).includes("watchdog") : false;

void (async () => {
  if (!isEntry) return;
  log(`starting. url=${URL} interval=${INTERVAL_MS}ms autofix=${AUTOFIX} once=${process.env.WATCHDOG_ONCE === "1"}`);
  let n = 0;
  if (process.env.WATCHDOG_ONCE === "1") {
    const ok = await cycle(0);
    process.exitCode = ok ? 0 : 1; // non-zero so CI / cron flags failures
    return;
  }
  while (true) {
    await cycle(n++).catch((e) => log(`cycle error: ${(e as Error).message}`));
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
})();
