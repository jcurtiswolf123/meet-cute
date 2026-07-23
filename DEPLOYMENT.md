# Meet Cute Deployment Guide

Production runs on Fly.io at `https://hellomeetcute.com`. The application uses Neon PostgreSQL and a standalone Next.js server image.

Launch status: HOLD as of 2026-07-23. Do not open public traffic until the blockers in `docs/LAUNCH-QA-2026-07-23.md` are resolved and reverified.

## Required release inputs

Confirm these categories before a release:

- Neon connection variables: `DATABASE_URL` and `DIRECT_URL`
- Public origin: `NEXT_PUBLIC_SITE_URL`
- Email provider variables and webhook signing secret
- SMS provider variables and webhook verification material
- Session and application secrets
- Sentry runtime variables
- Shared object storage credentials

Inspect secret names with `fly secrets list`. Never print secret values.

## Database changes

Schema changes are applied manually. The container does not change the database while starting.

Before any schema command:

1. Confirm the selected database is the intended environment.
2. Review the Prisma schema diff.
3. Take or verify a recoverable database backup.
4. Apply the schema with `npm run db:deploy`.
5. Verify the affected reads and writes before deploying application code.

The project does not yet have an automated migration gate. Treat schema changes as a separate release step.

## Build and verify

```bash
npm ci
npm run lint
npm run typecheck
npm run test:race
npm run build
npm audit --omit=dev --audit-level=high
```

The race test uses the configured database and cleans up its isolated rows. Confirm the database target first.

For Sentry source maps, provide `SENTRY_AUTH_TOKEN` as a BuildKit secret with Fly's `--build-secret` option. The Dockerfile mounts it only for the build command. Do not pass it as a Docker build argument or environment layer.

## Deploy

```bash
fly deploy
```

The Docker image runs `.next/standalone/server.js`. Fly performs a rolling release across two machines and checks `/healthz`.

## Post-deploy verification

Verify all of the following before considering the release complete:

```bash
fly status
curl -fsS https://hellomeetcute.com/healthz
curl -fsSI https://hellomeetcute.com/
curl -fsSI https://hellomeetcute.com/apply
```

Then use the authenticated browser QA flow to check:

- Public application validation
- Member sign-in, suggestion, profile, settings, and sign-out
- Operator sign-in, roster, introduction composer, mobile drawer, and sign-out
- Webhook rejection for unsigned requests
- Sentry error capture in a non-production test route
- Email and SMS provider delivery status

## Launch blockers

The current production topology has two machines and per-machine volumes. Local photo storage can return a missing file when the next request reaches the other machine. Configure shared object storage, or intentionally operate one machine until shared storage is available.

Introduction delivery currently lacks durable queued work and per-channel retry state. A process failure can leave a match between database state and provider delivery. Fix that before public launch.

The concierge worker is not scheduled, and its message path does not perform real booking, calendar, or reservation operations. Wire the workflow or disable the related actions and promises before launch.
