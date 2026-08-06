# mutuals

Premium matchmaking with public applications, a member app, and an operator studio.

> This file is auto-loaded by Claude Code at the start of every session in this
> folder. Keep it current. It is the durable, deterministic context for this
> project, not chat memory. Detailed living docs are in `docs/`.

## What this is
- Purpose: Operate a curated matchmaking service from application through introduction.
- Status: LIVE as of 2026-07-23. See `docs/STATUS.md` and `docs/LAUNCH-QA-2026-07-23.md`.
- Owner: Joshua Wolf

## Stack and key paths
- Language / framework: TypeScript/Node (Next.js, Tailwind, LLM)
- Entry point: src/app/ (Next.js App Router)
- Deploy target / live URL: Fly.io at https://hellomutuals.com
  (`hellomeetcute.com` and `meetcutehq.com` still resolve and 308 there)
- Important dirs/files: src, scripts, docs, public, prisma

## How to run
```bash
npm ci
npm run dev            # sandbox: throwaway local database, :3009
npm run test:launch
npm run build
```

`npm run dev` is a **local throwaway database**, not production, and every
outbound provider key is blank so it cannot email or text a member. The repo's
`.env` still points `DATABASE_URL` at the production Neon branch, so anything
that talks to a database needs `set -a; . ./.env.sandbox; set +a` first. Use
`. ./.env` only when you actually intend to touch the live roster, and say so
out loud when you do. `npm run dev:live` (:3019) is the deliberate way to point
a dev server at real data.

## Working alongside other sessions

**If another Claude session might be working in this repo, start your own
worktree before you touch anything:**

```bash
npm run session:new <short-name>   # worktree + branch + database + port
npm run session:list               # who is where, and what is dirty
npm run session:end <short-name>   # refuses to run if you have uncommitted work
```

Three sessions shared this one checkout on 2026-08-03 and every failure that day
came from it: an in-flight edit swept into someone else's commit and shipped, a
typecheck run against a half-written file, `prisma generate` breaking another
session's types, two dev servers fighting over one Next daemon, and a branch
merged out from under the session that made it.

A worktree gives you your own index, HEAD, files, database, and port. Inside
one, `git add -A` is safe again because it can only see your own tree.

If you are the only session, the main checkout is fine and nothing changes.

## Conventions
- Neon Postgres is production. Development uses the sandbox (`npm run dev`).
  Never run a database script without printing the target host first.
- Never stage a whole file another session may be editing. Inside your own
  worktree this is a non-issue; in the shared checkout it is how an unfinished
  nav link reached production.
- Production has two Fly machines. Uploads use Vercel Blob when configured and
  otherwise use Postgres, so no upload depends on one machine.
- Demo login is local development only.
- An application is accepted by **any two friends** writing recommendations, not
  by submitting the form. It was two friends of the opposite gender until
  2026-08-06; nothing reads gender as a gate now. See
  `src/lib/recommendations.ts` and `docs/DECISIONS.md`. Operator approval still
  works and is now the exception. A photo is required to apply.
- Somebody can also be put forward by a friend at `/refer` before they have
  applied. A nomination carrying real words becomes an answered recommendation
  when the nominee applies, so they are asked for one friend rather than two.
  See `src/lib/nominations.ts`.
- Every select and checkbox on a form driven by `useActionState` must be
  controlled. Uncontrolled ones reset on the re-render after a failed submit.
- No native `<select>` anywhere: its popup is OS chrome. Two to five options use
  `ChoiceGroup`, longer lists use `Select`, checkboxes use `Checkbox`, all in
  `src/components/`. See the Form controls section of `DESIGN.md`.
- Email magic links are shared authentication. `isOperator` grants studio
  access, while `isSuperAdmin` grants only operator-account management.
- Introduction delivery uses a database outbox with fenced workers, retries,
  authorization checks at send time, and operator-visible failure state.
- Venue booking and calendar coordination are manual. Do not claim they are
  automated.

## Design system
- Read `DESIGN.md` before making any visual or UI decision.
- Keep public marketing work aligned with its typography, palette, spacing,
  layout, motion, and copy rules.
- Do not deviate from the public design direction without explicit approval.
- In visual QA, flag code that does not match `DESIGN.md`.

## Context map (read these for state)
- `docs/STATUS.md` : current state, what's next, blockers
- `docs/EMAIL-TESTING.md` : how to test the reply-by-email match path, including
  against real inboxes
- `docs/REHEARSAL.md` : walking the whole introduction flow on the live site with
  Jess and two member accounts
- `docs/APPLICATION-FLOW.md` : every step from /apply to an accepted member,
  and every email that leaves along the way
- `docs/DECISIONS.md` : why things are the way they are
- `docs/TASKS.md` : backlog and in-progress work
- `docs/BRAND-RENAME.md` : the Meet-Cute to Mutuals rename, which deployment
  identifiers still carry the old name, and the cutover order
- `docs/SESSIONS.md` : running several Claude sessions on this repo at once
- `docs/ENGINEERING.md` : onboarding for a new engineer, and the traps

_Created 2026-06-24._
