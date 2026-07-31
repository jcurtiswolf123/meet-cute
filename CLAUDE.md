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
- Deploy target / live URL: Fly.io at https://hellomeetcute.com
- Important dirs/files: src, scripts, docs, public, prisma

## How to run
```bash
npm ci
npm run dev
npm run test:launch
npm run build
```

## Conventions
- Neon Postgres is used in development and production. Never run database scripts without verifying the target database.
- Production has two Fly machines. Uploads use Vercel Blob when configured and
  otherwise use Postgres, so no upload depends on one machine.
- Demo login is local development only.
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
- `docs/DECISIONS.md` : why things are the way they are
- `docs/TASKS.md` : backlog and in-progress work

_Created 2026-06-24._
