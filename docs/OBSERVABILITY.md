# Meet Cute Observability

Last updated 2026-07-23.

## Runtime checks

- `/healthz` confirms that the Node process is alive.
- `/readyz` confirms database connectivity and access to the required
  `DeliveryJob` and `PhotoAsset` schema.
- Fly checks `/readyz` every 15 seconds and promotes only ready machines.
- The deploy workflow checks `/healthz`, `/readyz`, and the home page after a
  rolling release.

## Sentry

Sentry is wired for server, edge, and browser errors. Automatic PII attachment is
disabled. The production Docker build receives the source-map token through a
BuildKit secret, so it is not stored in an image layer.

Required runtime configuration:

```text
SENTRY_DSN
NEXT_PUBLIC_SENTRY_DSN
SENTRY_ORG
SENTRY_PROJECT
```

Source-map upload and watchdog issue inspection also require
`SENTRY_AUTH_TOKEN`.

## Delivery monitoring

The database outbox records queued, processing, sent, failed, and cancelled
delivery work. The Studio home page exposes the total failure backlog, useful
context for the latest failures, and an eligibility-aware retry action.

The watchdog checks:

- Public site and readiness
- Database access
- Failed delivery work
- Stale processing work
- Unresolved Sentry issues
- Type checking
- Periodic production builds when run as a long-lived local process

The GitHub watchdog runs every 15 minutes. Configure:

```text
WATCHDOG_URL=https://hellomeetcute.com
WATCHDOG_ALERT_EMAIL
RESEND_API_KEY
DATABASE_URL
DIRECT_URL
SENTRY_AUTH_TOKEN
```

Optional AI autofix requires an AI provider key. It may open a verified pull
request for a typecheck regression. It never merges or deploys automatically.
The scheduled GitHub pass sets `WATCHDOG_SKIP_BUILD=1` because the deploy
workflow already owns the full production-build gate.

## Launch monitoring

During a release:

1. Watch the GitHub migration, test, and deploy jobs.
2. Confirm both Fly machines report ready on the new release.
3. Check Sentry for new production issues.
4. Check the Studio delivery-failure panel and stale-work watchdog result.
5. Review Fly logs for repeated readiness, provider, or database errors.
6. Roll back application code if authentication, private media, or delivery
   behaves inconsistently.
