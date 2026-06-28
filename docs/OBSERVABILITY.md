# Observability: Sentry + AI fixing

Meet Cute ships with error tracking and two layers of AI-assisted fixing. Both
are no-ops until configured, so the current build is unchanged until you turn
them on with env vars.

## 1. Sentry (error + performance tracking)

Wired in code already:

- `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation-client.ts`
- `src/instrumentation.ts` loads the right config per runtime
- `next.config.mjs` wraps the build with `withSentryConfig` only when a DSN is
  present (source-map upload + a same-origin `/monitoring` tunnel that satisfies
  the strict CSP)
- `sendDefaultPii: false` everywhere (dating app: never auto-attach user
  identifiers, IPs, or request bodies)
- `Sentry.captureException` is called in the SMS webhooks
  (`/api/sms/inbound`, `/api/sms/conversations`) and in the group-intro failure
  path (`src/lib/introductions.ts`)

### Turn it on (production)

Set these as Fly secrets (and as Docker build args / Fly build secrets so source
maps upload at build time):

```
SENTRY_DSN=...                 # server/edge DSN
NEXT_PUBLIC_SENTRY_DSN=...      # browser DSN (same project is fine)
SENTRY_ORG=...
SENTRY_PROJECT=...
SENTRY_AUTH_TOKEN=...           # build-time: source-map upload; also used by the watchdog
# optional sampling (defaults 0.1)
SENTRY_TRACES_SAMPLE_RATE=0.1
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1
```

```bash
fly secrets set SENTRY_DSN=... NEXT_PUBLIC_SENTRY_DSN=... SENTRY_ORG=... SENTRY_PROJECT=... SENTRY_AUTH_TOKEN=...
```

## 2. AI fixing

Two complementary loops:

### a) Sentry Seer (runtime errors -> AI fix PRs)

Seer is Sentry's built-in AI agent. It reads a runtime issue with its stack
trace, proposes a root cause, and (with the GitHub integration connected) can
open a fix PR. This is the right tool for live runtime errors. Enable it in the
Sentry UI:

1. Settings -> Integrations -> connect the GitHub repo for this project.
2. Settings -> Seer / Automation -> enable automatic issue scans and "create
   pull requests" (or keep it to root-cause suggestions if you want a human to
   trigger the PR).
3. Issues then get a "Solve with Seer" action; auto-PRs land on a branch for
   review. It never merges on its own.

### b) Watchdog (build/typecheck regressions -> AI fix PRs)

`npm run watchdog` (see `scripts/watchdog.ts`) runs continuously: it checks the
live site, the DB, typecheck, periodic build, and now also pulls recent
unresolved Sentry issues into its status + alerts (when `SENTRY_AUTH_TOKEN` +
`SENTRY_ORG` + `SENTRY_PROJECT` are set).

When `WATCHDOG_AUTOFIX=1` and an AI key is present
(`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`), a **typecheck** regression triggers a
guarded AI fix: it asks for a minimal patch, applies it on a throwaway
`watchdog/fix-*` branch, re-runs typecheck to verify, and opens a PR with `gh`.
It never edits the working branch and never touches prod.

```bash
WATCHDOG_AUTOFIX=1 ANTHROPIC_API_KEY=... npm run watchdog
```

Division of labor: **Seer** handles runtime errors (it has the stack trace and
can verify against the issue); the **watchdog** handles build/typecheck health
(it can verify a fix by recompiling). Together they cover both failure classes.
