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
  `RESEND_FROM` MUST be on a domain verified in Resend (the default placeholder
  `hello@meet-cute.app` returns Resend 403 "domain is not verified"). Verify the
  meet-cute domain in Resend, or send from an already-verified domain.
  Hardening (post-review, 2026-06-15): magic-link base is NEVER derived from the
  Host header in production (host-injection -> token-leak / account takeover);
  requires `NEXT_PUBLIC_APP_URL`, host fallback is dev-only. `requestMagicLink`
  rate-limited per-IP (10/hr) and per-email (3/15min) to stop inbox-bombing /
  mail-quota abuse (verified: 3 sends out of 5 rapid requests). Dev email fallback
  gated on `NODE_ENV !== production` and logs only the link in dev, never in prod.
- [x] **Per-account private state.** DONE 2026-06-15. Audited member-facing
  queries: `/app`, `/app/matches`, `/app/profile`, `/app/settings` all scope to
  the session person (matches filtered to participant; studio is operator-only).
  Block filtering added to `createSuggestion` and `blockPerson` (exits live
  matches). Still TODO at deploy: reseed prod with an empty/real roster, never
  the demo sandbox.
- [x] **Legal / PII.** DONE 2026-06-15. `/privacy` + `/terms` pages (draft,
  pending counsel). Signup consent checkbox + 18+ at `/apply`
  (`completeApplication` stores `agreedTosAt`, `birthdate`). Account + full-data
  deletion: `deleteAccount` cascade (verified: person, matches, sessions removed,
  no FK errors) behind a typed-DELETE confirm on `/app/settings`. Data export:
  `/api/me/export` (JSON download).
- [x] **Safety (dating app).** DONE 2026-06-15. Report + block between members
  (`reportPerson`, `blockPerson`, `unblockPerson`; `SafetyControls` on matches;
  blocked excluded from suggestions). Photo upload with moderation: `/api/photos`
  upload (auth, type+size allowlist, stored to volume) creates photos `pending`;
  `/api/photos/[file]` serves approved to members, pending/rejected only to owner
  or operator (verified: upload returns pending, badge shown); operator queue at
  `/studio/moderation` (approve/reject photos, resolve reports). 18+ gate at
  signup. NOTE: moderation is human-only; add an automated pre-filter (e.g.
  Rekognition/Hive) before high volume. Vetting = applicant status + operator review.
- [ ] **Config / secrets (at deploy).** Set `RESEND_API_KEY` (already on Fly),
  `RESEND_FROM` (MUST be a Resend-verified domain), `NEXT_PUBLIC_APP_URL`,
  `STUDIO_DEMO_PASSWORD`. `SESSION_SECRET` no longer used (safe to drop). Push the
  new schema to the Fly volume DB and reseed prod empty before opening signups.

## Tier 1: design polish + operations (THIS WEEK)

Design polish:
- [x] **High-end landing page hero.** Espresso dark full-bleed, optional video, aurora motion fallback, warm film-grain aesthetic. DONE 2026-06-15.
- [x] **Landing page design spec.** Type scale (modular 12-72), section alternation (espresso backgrounds), champagne gradient dividers, numbered steps instead of cards, button polish with distinct states, footer polish. DONE 2026-06-15.
- [x] **In-app member UI polish.** Full-height photo hero, better whitespace, new typography scale, refined decision states, improved empty state. DONE 2026-06-15.
- [ ] **Hero video asset.** Acquire or create /hero.mp4 (6 min, warm cinematic, film-grained intimacy). Currently fallback aurora motion works great.

Operations (for actual member usage):
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
