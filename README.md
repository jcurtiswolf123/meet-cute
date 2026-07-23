# Meet Cute

Meet Cute is a curated matchmaking app with a public application funnel, a
member experience, and an operator studio.

Launch status: LIVE as of 2026-07-23. The release evidence and
remaining external review item are in
[`docs/LAUNCH-QA-2026-07-23.md`](docs/LAUNCH-QA-2026-07-23.md).

## Product surfaces

| Surface | Route | Purpose |
|---|---|---|
| Public site | `/`, `/apply`, `/dinners`, `/coaching` | Explain the service and collect applications |
| Member app | `/app` | Manage a profile, review curated introductions, and view connections |
| Operator studio | `/studio` | Review the roster, create introductions, moderate content, and monitor delivery |
| Email decisions | `/i/[token]` | Let invited members privately accept or pass |
| Liveness | `/healthz` | Confirm the Node process is accepting requests |
| Readiness | `/readyz` | Confirm the process can query the required production schema |

Meet Cute does not automatically book venues or send calendar invitations. When
two members accept an introduction, the app shares authorized contact details
and tells the operator to coordinate the date manually.

## Local development

Requirements:

- Node.js 22
- A dedicated PostgreSQL database
- A local `.env` based on `.env.example`

Use a disposable database with the `meetcute` schema for local work.

```bash
npm ci
npm run db:deploy
npm run db:seed
npm run dev
```

The app runs at `http://localhost:3009`. Demo login is available only outside
production when explicitly enabled.

## Release verification

```bash
npm run typecheck
npm run lint
npm run test:launch
npm run test:race
npm run build
npm audit --audit-level=low
```

The database-backed tests use isolated identifiers and remove their fixtures.
Confirm the selected database before running them.

## Production architecture

- Next.js App Router, React, TypeScript, and Tailwind CSS
- Neon PostgreSQL with schema `meetcute`
- Fly.io with two always-on machines and rolling deployments
- Vercel Blob when configured, otherwise shared Postgres photo storage
- A database-backed delivery outbox for email and SMS
- Resend for email, Twilio or Telnyx for SMS
- Sentry and the scheduled watchdog for monitoring

The Fly volumes are retained only as legacy mounts. Production data and uploads
do not rely on a machine-local filesystem.

## Operational limits

- Venue selection, reservation, and calendar coordination remain manual.
- Photo moderation is performed by an operator.
- The legal pages are implemented, but launch counsel review remains external
  work and is not represented as legal approval.

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for the release procedure,
[`LAUNCH-CHECKLIST.md`](LAUNCH-CHECKLIST.md) for launch gates, and
[`docs/STATUS.md`](docs/STATUS.md) for the dated source of truth.
