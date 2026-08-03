// One isolated working copy per Claude session.
//
// On 2026-08-03 three sessions edited this repo at once through a single
// checkout, and every failure that day came from that one fact:
//
//   - One session ran `git add` on layout.tsx while another had an uncommitted
//     edit in it, swept the edit into an unrelated commit, and shipped a
//     sidebar link to a page that did not exist yet.
//   - A typecheck failed against a half-written file another session was
//     mid-way through, then the file vanished before it could be read.
//   - `prisma generate` in one session broke the types another was checking.
//   - Next 16 keeps ONE dev server per directory and silently reuses it,
//     environment and all, so two sessions running `npm run dev` got one
//     server with whichever database won.
//   - A branch was merged out from under the session that created it.
//
// Git already solves this. A worktree is a second checkout of the same
// repository with its own index, HEAD, and files, sharing the object store. Two
// sessions in two worktrees cannot stage, generate, or serve over each other,
// and `git add -A` becomes safe again because it can only ever see your tree.
//
//   npm run session:new studio-polish   # worktree + branch + database + port
//   npm run session:list
//   npm run session:end studio-polish
//
// Worktrees live OUTSIDE the repository, deliberately: one was created under
// .claude/ earlier today and eslint walked into it and reported 49,000 problems
// in a second copy of the codebase.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const REPO = process.env.MUTUALS_MAIN_REPO || resolve(process.cwd());
const SESSIONS_DIR = resolve(REPO, "..", `${basename(REPO)}-sessions`);
const CONTAINER = "mutuals-sandbox-pg";
const PG_PORT = 5433;

function git(args: string[], cwd = REPO): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function sh(cmd: string, args: string[], opts: { cwd?: string; quiet?: boolean } = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? REPO,
    encoding: "utf8",
    stdio: opts.quiet ? "pipe" : "inherit",
  });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

function die(msg: string): never {
  console.error(`\nsession: ${msg}\n`);
  process.exit(1);
}

/** Names become branch names, directory names, database names and a port, so
 *  keep them boring. */
function normalize(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) die("give the session a name, e.g. `npm run session:new studio-polish`");
  if (slug.length > 40) die("session name is too long");
  return slug;
}

/** Deterministic so a session always comes back on the same port and database,
 *  and two different names practically never collide. 3020 upward leaves 3009
 *  (the main checkout) and 3019 (dev:live) alone. */
function portFor(slug: string): number {
  const h = parseInt(createHash("sha256").update(slug).digest("hex").slice(0, 8), 16);
  return 3020 + (h % 200);
}

const dbFor = (slug: string) => `mutuals_s_${slug.replace(/-/g, "_")}`;
const dirFor = (slug: string) => join(SESSIONS_DIR, slug);
const branchFor = (slug: string) => `session/${slug}`;

function dockerUp(): boolean {
  return sh("docker", ["info"], { quiet: true }).ok;
}

function containerRunning(): boolean {
  const r = sh("docker", ["inspect", "-f", "{{.State.Running}}", CONTAINER], { quiet: true });
  return r.ok && r.out.trim() === "true";
}

function psql(sql: string): { ok: boolean; out: string } {
  return sh("docker", ["exec", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-tAc", sql], {
    quiet: true,
  });
}

function newSession(rawName: string) {
  const slug = normalize(rawName);
  const dir = dirFor(slug);
  const branch = branchFor(slug);
  const port = portFor(slug);
  const db = dbFor(slug);

  if (existsSync(dir)) die(`${dir} already exists. Use it, or end the session first.`);

  // Branch from the current origin/master rather than whatever the main
  // checkout happens to be sitting on, so a session never inherits another
  // session's half-finished work.
  console.log("session: fetching origin");
  sh("git", ["fetch", "--quiet", "origin"], { quiet: true });
  const base = sh("git", ["rev-parse", "--verify", "origin/master"], { quiet: true }).ok
    ? "origin/master"
    : "HEAD";

  mkdirSync(SESSIONS_DIR, { recursive: true });
  console.log(`session: worktree at ${dir} on ${branch} (from ${base})`);
  const wt = sh("git", ["worktree", "add", "-b", branch, dir, base]);
  if (!wt.ok) die("could not create the worktree");

  // node_modules is 900MB and prisma generates INTO it, so it cannot be shared:
  // one session running `prisma generate` would change the types another is
  // checking. On APFS `cp -c` clones copy-on-write, which is instant and gives
  // each worktree a genuinely independent tree.
  console.log("session: cloning node_modules");
  if (!sh("cp", ["-Rc", join(REPO, "node_modules"), join(dir, "node_modules")], { quiet: true }).ok) {
    console.log("  (clone unavailable on this filesystem, falling back to npm ci)");
    if (!sh("npm", ["ci"], { cwd: dir }).ok) die("npm ci failed");
  }

  console.log(`session: database ${db} on ${PG_PORT}`);
  if (!dockerUp()) {
    console.log("  Docker is not running. Start it and run `npm run sandbox:up` inside the worktree.");
  } else {
    if (!containerRunning()) sh("npx", ["tsx", "scripts/sandbox.ts", "up"], { cwd: dir });
    else {
      const exists = psql(`SELECT 1 FROM pg_database WHERE datname='${db}'`).out.trim() === "1";
      if (!exists) psql(`CREATE DATABASE ${db}`);
      sh("npx", ["tsx", "scripts/sandbox.ts", "up"], { cwd: dir });
    }
  }

  console.log(
    [
      "",
      `session "${slug}" is ready.`,
      "",
      `  cd ${dir}`,
      `  npm run dev          ->  http://127.0.0.1:${port}`,
      `  branch                   ${branch}`,
      `  database                 ${db}`,
      "",
      "Nothing you do in there can touch another session's files, index, or database.",
      "",
    ].join("\n"),
  );
}

function listSessions() {
  const raw = git(["worktree", "list", "--porcelain"]);
  const entries: { path: string; branch: string }[] = [];
  let current: { path?: string; branch?: string } = {};
  for (const line of raw.split("\n")) {
    if (line.startsWith("worktree ")) current = { path: line.slice(9) };
    else if (line.startsWith("branch ")) current.branch = line.slice(7).replace("refs/heads/", "");
    else if (line === "" && current.path) {
      entries.push({ path: current.path, branch: current.branch ?? "(detached)" });
      current = {};
    }
  }
  if (current.path) entries.push({ path: current.path, branch: current.branch ?? "(detached)" });

  console.log("\nWorking copies of this repository:\n");
  for (const e of entries) {
    const slug = basename(e.path);
    const isSession = e.path.startsWith(SESSIONS_DIR);
    const port = isSession ? portFor(slug) : e.path === REPO ? 3009 : null;
    const dirty = sh("git", ["status", "--porcelain"], { cwd: e.path, quiet: true }).out;
    const changed = dirty ? dirty.split("\n").length : 0;
    console.log(`  ${isSession ? "session" : "main   "}  ${e.branch.padEnd(28)} ${port ? `:${port}` : "     "}  ${changed ? `${changed} changed` : "clean"}`);
    console.log(`           ${e.path}`);
  }
  console.log("");
}

function endSession(rawName: string) {
  const slug = normalize(rawName);
  const dir = dirFor(slug);
  const branch = branchFor(slug);
  if (!existsSync(dir)) die(`no session at ${dir}`);

  const dirty = sh("git", ["status", "--porcelain"], { cwd: dir, quiet: true }).out;
  if (dirty) {
    die(
      `${dir} has uncommitted changes:\n${dirty}\n\n` +
        "Commit or discard them first. This will not throw away work for you.",
    );
  }

  const unpushed = sh("git", ["log", "--oneline", `origin/master..${branch}`], { cwd: REPO, quiet: true });
  if (unpushed.ok && unpushed.out) {
    console.log(`\nHeads up, ${branch} has commits that are not on origin/master:\n${unpushed.out}\n`);
    console.log("The branch is kept. Only the working copy and its database go.\n");
  }

  console.log(`session: removing worktree ${dir}`);
  sh("git", ["worktree", "remove", dir, "--force"]);
  rmSync(dir, { recursive: true, force: true });

  if (dockerUp() && containerRunning()) {
    const db = dbFor(slug);
    console.log(`session: dropping database ${db}`);
    psql(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
  }

  console.log(
    `\nEnded. The branch ${branch} still exists; delete it with \`git branch -D ${branch}\` once it is merged.\n`,
  );
}

const [command, arg] = process.argv.slice(2);
switch (command) {
  case "new":
    newSession(arg ?? "");
    break;
  case "list":
    listSessions();
    break;
  case "end":
    endSession(arg ?? "");
    break;
  default:
    die("one of: new <name>, list, end <name>");
}
