# Meet Cute

Meet Cute is a curated matchmaking app with a public application funnel, a member experience, and an operator studio.

Launch status: HOLD as of 2026-07-23. The detailed verdict and open blockers are in [`docs/LAUNCH-QA-2026-07-23.md`](docs/LAUNCH-QA-2026-07-23.md).

## Product surfaces

| Surface | Route | Purpose |
|---|---|---|
| Public site | `/`, `/apply`, `/dinners`, `/coaching` | Explain the service and collect applications |
| Member app | `/app` | Manage a profile, review curated introductions, and view connections |
| Operator studio | `/studio` | Review the roster, create introductions, moderate content, and monitor operations |
| Email decisions | `/i/[token]` | Let invited members privately accept or pass |
| Health check | `/healthz` | Report process liveness to Fly |

The concierge code currently writes in-app messages only. It is not scheduled in production and does not book venues, send calendar invitations, or confirm reservations.

## Local development

Requirements:

- Node.js 22
- A dedicated PostgreSQL database
- A local `.env` based on `.env.example`

Verify that `DATABASE_URL` and `DIRECT_URL` point to a disposable development database before running database commands.

```bash
npm ci
npm run db:deploy
npm run db:seed
npm run dev
```

The app runs at `http://localhost:3009`. Demo login is available only in local development when explicitly enabled.

## Verification

```bash
npm run lint
npm run typecheck
npm run test:race
npm run build
npm audit --omit=dev --audit-level=high
```

`test:race` creates isolated QA rows in the configured database and removes them when it finishes. Do not run it against an unknown database target.

## Stack

- Next.js App Router and React
- TypeScript and Tailwind CSS
- Prisma with Neon PostgreSQL
- Fly.io with two always-on machines
- Resend for email
- Twilio or Telnyx for SMS
- Sentry for error monitoring

## Current operational limits

- Photo uploads need shared object storage before a two-machine production launch. The local filesystem fallback is not shared between Fly machines.
- Introduction delivery needs durable queued work, provider message identifiers, retries, and visible per-channel failure state.
- The concierge and operator booking actions must be wired to real delivery and booking operations, or disabled.
- Event capacity is displayed but is not transactionally enforced.

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for the Fly release procedure and [`docs/STATUS.md`](docs/STATUS.md) for the current source of truth.
