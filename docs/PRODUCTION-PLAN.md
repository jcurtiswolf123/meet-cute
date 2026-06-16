# Meet Cute: production plan (real users)

Single source of truth for taking Meet Cute from security-audited demo to real
public production. Started 2026-06-15. Update this as items land.

## Decisions (locked 2026-06-15)

- **Launch scope: open public signups.** Anyone can apply and join. This sets a
  high trust-and-safety bar (ID/age verification, photo moderation, report/block,
  abuse controls, full ToS/privacy).
- **Auth: email magic-link** (passwordless), sent via Resend. Session table for
  revocation. SMS can be added later for higher identity trust.
- **Hosting: stay on Fly.io for now** (SQLite on the persistent volume is fine
  for early real usage). Move to Neon Postgres + pgvector when we need multiple
  instances or higher write volume. Schema is already provider-agnostic.

## Status legend

[x] done and verified  ·  [~] in progress  ·  [ ] not started

## Tier 0: hard blockers before a single real person logs in

- [x] **Real auth (magic-link).** DONE 2026-06-15. Demo pick-any-user replaced.
  Opaque, revocable sessions in a `Session` table (cookie holds a random token,
  only its SHA-256 hash is stored); `LoginToken` table for magic links (hashed,
  15-min expiry, single-use). Email via Resend (`src/lib/email.ts`, logs in dev
  when `RESEND_API_KEY` unset). Same "check your email" response to avoid email
  enumeration. New emails create an `applicant` and route to `/apply`. Demo login
  throws in production, dev-only picker behind `NODE_ENV !== production`.
  Verified end to end: token single-use, applicant auto-create, session grants
  `/app`, sign-out revokes. Build passes with `/auth/verify` + `/login`.
  Files: `prisma/schema.prisma`, `src/lib/auth.ts`, `src/lib/email.ts`,
  `src/lib/actions.ts`, `src/app/login/page.tsx`, `src/app/auth/verify/route.ts`.
  Note: `SESSION_SECRET` is no longer used by auth (sessions are DB-backed); safe
  to drop. Set `RESEND_API_KEY`, `RESEND_FROM`, `NEXT_PUBLIC_APP_URL` for prod.
- [ ] **Per-account private state.** Today one shared synthetic roster. Real
  members must only see their own data. Audit every query that lists people /
  matches to scope by the session person. Reseed prod with an empty/real roster,
  never the demo sandbox.
- [ ] **Legal / PII.** Privacy policy, Terms of Service, signup consent
  checkbox, data-retention statement, and **account + full-data deletion**
  (cascade delete a Person and all related rows; honor on request).
- [ ] **Safety (dating app).** Report + block between members, photo upload with
  moderation (signed uploads to blob + automated + human review), and age 18+
  gate. Vetting flow that backs the "by introduction only" promise.
- [ ] **Config / secrets.** Rotate `SESSION_SECRET`, set `RESEND_API_KEY`,
  `RESEND_FROM`, `STUDIO_DEMO_PASSWORD` (gate the studio), `NEXT_PUBLIC_APP_URL`.

## Tier 1: to actually operate with members

- [ ] **Concierge over real channels.** Swap the `say()` transport in
  `src/lib/concierge.ts` to SMS/WhatsApp (Twilio). Run `scripts/concierge-tick.ts`
  on a 15-min cron (Fly scheduled machine).
- [ ] **Observability.** Sentry (client + server), structured logs, uptime check,
  alerting.
- [ ] **Backups.** Automated snapshots of the Fly SQLite volume (or move to Neon).
- [ ] **Abuse / rate limiting at scale.** In-memory limiter is per-instance; move
  to Upstash/Redis if running more than one instance. Per-account abuse controls.

## Tier 2: scale / quality

- [ ] **Neon Postgres + pgvector** when the roster outgrows a single volume /
  in-process cosine retrieval.
- [ ] **Real venue booking.** Wire Resy/OpenTable so the bot books an actual
  table on confirmation (today: standing held slots).
- [ ] **Tests.** Unit tests for the concierge state machine and server-action
  authz; a smoke e2e for the core flows.
- [ ] **AI cost / quality.** Budget the provider, add caching; a BAA only matters
  if real PII ever enters prompt context (today only synthetic does).

## Sequence

1. Tier 0 auth (this branch) -> 2. per-account state + legal/deletion ->
3. safety (report/block, photo moderation, 18+) -> 4. secrets + deploy ->
5. Tier 1 (Twilio concierge, Sentry, backups) -> 6. Tier 2 as scale demands.

Public launch is gated on all of Tier 0 plus report/block + photo moderation +
18+ from the safety row. Do not open signups before those.
