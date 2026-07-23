# Meet Cute Deployment Guide

Production runs on Fly.io at `https://hellomeetcute.com`. The application uses
Neon PostgreSQL and a standalone Next.js Docker image.

Launch status: LIVE as of 2026-07-23.

## Infrastructure

- Two always-on Fly machines in `sjc`
- Rolling Fly releases gated by `/readyz`
- Neon PostgreSQL, schema `meetcute`
- Vercel Blob when configured, otherwise Postgres-backed photo bytes
- Database delivery outbox processed by each app machine with fenced leases
- Sentry for runtime errors and source maps
- A scheduled GitHub watchdog for site, schema, delivery, and Sentry checks

Kubernetes is not used. The current Fly and Docker topology provides rolling
deployment, health gating, and two-machine availability without the extra
operational surface of a Kubernetes control plane.

## Required GitHub release inputs

The deploy workflow needs these GitHub Actions secrets:

- `DATABASE_URL`
- `DIRECT_URL`
- `FLY_API_TOKEN`
- `SENTRY_AUTH_TOKEN` for source-map upload

The watchdog also uses:

- `WATCHDOG_ALERT_EMAIL`
- `RESEND_API_KEY`
- `SENTRY_AUTH_TOKEN`
- Optional `OPENAI_API_KEY` for guarded autofix pull requests

Set the `WATCHDOG_URL` repository variable to
`https://hellomeetcute.com`. Inspect names only when auditing configuration.
Never print secret values.

## Automated release path

A push to `master` runs the deploy workflow:

1. Install from the lockfile.
2. Generate the Prisma client.
3. Run type checking, lint, pure launch tests, and the production build.
4. Apply checked-in migrations with `prisma migrate deploy`.
5. Run database launch tests and the introduction race test.
6. Build and deploy the Docker image to Fly.
7. Require successful `/healthz`, `/readyz`, and home-page canary requests.

Application machines do not modify the schema while starting. The migration
step completes before the rolling release begins.

## Current Fly Machine limit

The Fly organization is currently capped at two Machines, and both slots are
used by production. Fly can build and push a release image, but its in-place
Machine update returns a Machine-limit error while both slots are occupied.
This is an account constraint, not an application or image failure.

The preferred fix is to ask Fly Billing to raise the Machine limit. Until that
is complete, use this controlled rotation:

1. Let the GitHub workflow finish every CI, migration, database test, and image
   build step. Record the exact registry image tag from the failed deploy step.
2. Confirm both existing Machines pass readiness. Record each Machine ID and
   attached volume ID.
3. Stop and destroy exactly one Machine. Do not delete its volume.
4. Confirm the remaining Machine still serves `/healthz` and `/readyz`.
5. Deploy the recorded image with `--update-only`, `--strategy rolling`, and
   `--max-unavailable 1`.
6. Wait for the updated Machine and the public readiness route to pass.
7. Scale the app back to two Machines in `sjc`. Fly assigns the unattached
   legacy volume to the new Machine.
8. Confirm both Machines use the recorded image, both readiness checks pass,
   and both original volume IDs remain attached.

Never destroy the remaining Machine before the updated Machine is ready. Never
delete either volume as part of this workaround. The legacy volumes do not hold
production data, but preserving them keeps the release reversible and avoids an
unrelated storage change during deployment.

## Local release verification

```bash
npm ci
npm run db:deploy
npm run typecheck
npm run lint
npm run test:launch
npm run test:race
npm run build
npm audit --audit-level=low
docker build -t meet-cute:release .
```

Run the image with the required environment variables inherited from a trusted
local source. Do not pass the repository `.env` directly to Docker because
quoted values are not parsed like Node environment files.

Verify:

- The runtime user is `node`.
- `/healthz`, `/readyz`, and `/` return 200.
- The image contains no `.env`, database dump, `.gstack`, or upload artifacts.

## Database safety and rollback

Before a schema release:

1. Confirm both connection URLs target the intended database and the
   `meetcute` schema.
2. Review every migration.
3. Verify a recent recoverable backup.
4. Apply only additive or backward-compatible changes before application code.
5. Confirm `/readyz` against the migrated schema.

For an application regression, redeploy the previous known-good image or commit.
For a database regression, stop the rollout and use a reviewed forward repair.
Do not attempt an automatic destructive migration rollback. Restore from the
verified backup only if a reviewed forward repair is unsafe.

## Post-deploy canary

```bash
fly status -a meet-cute
curl -fsS https://hellomeetcute.com/healthz
curl -fsS https://hellomeetcute.com/readyz
curl -fsSI https://hellomeetcute.com/
curl -fsSI https://hellomeetcute.com/apply
```

Then verify desktop and mobile browser behavior, no console errors, protected
route authorization, webhook signature rejection, delivery failure visibility,
and both Fly machines on the new release.
