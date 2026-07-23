# meet-cute

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
- Introduction delivery uses a database outbox with fenced workers, retries,
  authorization checks at send time, and operator-visible failure state.
- Venue booking and calendar coordination are manual. Do not claim they are
  automated.

## Context map (read these for state)
- `docs/STATUS.md` : current state, what's next, blockers
- `docs/DECISIONS.md` : why things are the way they are
- `docs/TASKS.md` : backlog and in-progress work

_Created 2026-06-24._
