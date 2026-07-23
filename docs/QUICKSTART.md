# Meet Cute Quick Start

Live app: `https://hellomeetcute.com`

Meet Cute is a curated matchmaking service. Members use passwordless magic-link
sign-in. Operators review applicants and create one introduction at a time.

## Local setup

Use Node.js 22 and a disposable PostgreSQL database.

```bash
cp .env.example .env
npm ci
npm run db:deploy
npm run db:seed
npm run dev
```

The local app runs at `http://localhost:3009`.

Both database URLs must target the `meetcute` schema. The example connection
strings include the required schema query parameter.

## Core routes

| Surface | Route |
|---|---|
| Public application | `/apply` |
| Member app | `/app` |
| Operator studio | `/studio` |
| Photo and report moderation | `/studio/moderation` |
| Team access | `/studio/team` |
| Liveness | `/healthz` |
| Readiness | `/readyz` |

## Local demo login

Set `MEETCUTE_DEMO_LOGIN=1` only in local development to show a demo picker.
Production rejects demo login regardless of that environment value.

## Verification

```bash
npm run typecheck
npm run lint
npm run test:launch
npm run test:race
npm run build
```

The database-backed tests use isolated fixtures and remove them afterward.

## Production notes

- Photos use Vercel Blob when configured and Postgres otherwise.
- Introduction email and SMS work uses the database delivery outbox.
- Date booking and calendar invitations are not automated.
- Deploy through the reviewed GitHub workflow described in `DEPLOYMENT.md`.
