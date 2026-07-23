# Meet Cute: production readiness

Historical readiness snapshot from 2026-06-15. It is superseded by
`docs/STATUS.md`, `docs/LAUNCH-QA-2026-07-23.md`, and `LAUNCH-CHECKLIST.md`.
The SQLite, demo-login, local-upload, and automated-booking descriptions below
are not current.

Last updated 2026-06-15.

## Live demo

- URL: https://meet-cute.fly.dev
- Sign in at /login (demo login: pick any seeded member to see the app, or an operator (Jess, Zoe, Erik) to see the matchmaker studio).
- Hosting: Fly.io, single container, SQLite on a persistent 1GB volume at /data. Writes (opt-ins, slot picks, notes) survive restarts. The roster is synthetic seed data.

## What is built

| Area | Status | Notes |
|---|---|---|
| Consumer app | Working | Profile editor, one curated suggestion at a time (no swipe feed), mutual opt-in, the vouching layer, referral codes. |
| Concierge bot | Working | Propose-not-coordinate booking: names a venue, offers specific slots, overlap confirms, no-overlap gets round 2, then human handoff. One-way .ics, morning-of nudge, 24h post-date check-in. State machine in src/lib/concierge.ts. Cron entry: scripts/concierge-tick.ts. |
| Vouching | Working | Passive vouches on profiles plus the post-match "ask a mutual friend." Mutual-friend graph derived from referrals, dinner co-attendance, and vouches (no LinkedIn/contacts dependency). |
| Matchmaker studio | Working | Searchable/filterable roster, match pipeline (suggested to together), per-person view with history/notes/graph/dinners/coaching, one-click suggestions. |
| AI co-pilot | Working | RAG over roster + notes on NVIDIA Llama 3.3 70B (free tier). Embeddings via NVIDIA nv-embedqa (1024-dim). Falls back to a real local intent engine if no provider is funded. |
| Brand + funnel | Working | Landing, application, dinners, coaching, animated testimonial marquee, OG image, favicon. |

## Quality bar applied

- Design: distinctive brand (Fraunces + Inter, cream/claret palette, not the AI-default purple/gradient), motion, an animated marquee adapted from a 21st.dev pattern.
- Loading and feedback: pending/spinner states on every action (useFormStatus), skeleton loaders on async routes, error and not-found boundaries, accessible focus rings.
- Verified live: home 200, security headers present, operator login + co-pilot answering on NVIDIA, member opt-in persisting across reload.

## Security posture

A full senior-engineer audit was run. Fixed before hosting:
- Removed the unauthenticated /api/debug info-disclosure endpoint.
- Stopped tracking the SQLite db in git; gitignored.
- Signed the session cookie with an HMAC (SESSION_SECRET), added the secure flag, verify on read. The cookie can no longer be forged to an arbitrary id.
- Added authorization to every mutating server action: addNote and createSuggestion are operators-only; replyReference is restricted to the asked friend; requestReference validates the caller is a match participant and the friend is a genuine mutual.
- Escaped the dynamic RegExp in the co-pilot (ReDoS); delimited and sanitized all DB-derived text fed to the LLM (prompt-injection); the LLM is instructed to treat roster/notes as data, not instructions.
- Rate-limited /api/copilot (cost protection) and bounded its input.
- Locked image hosts to i.pravatar.cc; added CSP, X-Frame-Options, nosniff, Referrer-Policy, HSTS.
- API keys live as Fly secrets (NVIDIA_API_KEY, SESSION_SECRET), never in the image or git.

Intentional demo tradeoffs (documented, not accidental):
- The demo login lets a visitor pick any seeded user, including operators, so the studio and co-pilot can be shown off. Set STUDIO_DEMO_PASSWORD as a Fly secret to gate operator access behind a passphrase with zero code change. For real production, replace the demo login with magic-link or SMS auth.
- State is shared across visitors (one synthetic sandbox). It resets only on a fresh volume. Re-seed by destroying and recreating the volume, or run the seed script against /data.

## What this needs to go to real production

1. Real authentication: magic-link or SMS (the demo login is a stand-in). Add a Session table for revocation.
2. Real members and PII handling: a privacy policy, consent, data retention, and the ability to delete an account and its data. Never let real applicant data into a committed database.
3. Database at scale: SQLite on one Fly volume is fine for a single-instance demo and early real usage. For multiple instances or higher write volume, move to managed Postgres (Neon) and run prisma migrate deploy. The schema is already provider-agnostic.
4. The concierge over real channels: today the bot writes in-app messages. Production wants SMS/WhatsApp via Twilio. The send path is isolated in concierge.ts (the say function), so the transport is a one-function swap. Run scripts/concierge-tick.ts on a 15-minute cron (Fly scheduled machine or a worker).
5. Real venue booking: v1 uses standing held slots. v2 wires Resy/OpenTable so the bot books an actual table on confirmation.
6. Photo uploads: today profiles use placeholder avatars. Add an upload path (signed uploads to a blob store) with content moderation, and keep image hosts allowlisted.
7. Rate limiting and abuse: the in-memory limiter works on one instance. For multiple instances use Upstash/Redis. Add per-account abuse controls.
8. Observability: error tracking (Sentry), structured logs, uptime checks, and alerting. Generic client-facing error copy is in place; wire server-side logging.
9. AI cost and quality: NVIDIA free tier is fine for a demo. For production, budget the provider, add caching, and consider a BAA if any real PII ever enters the prompt context (today only synthetic data does).
10. Tests: add unit tests for the concierge state machine and the authz on server actions, plus a smoke e2e for the core flows, before shipping changes.

## Known limitations (today)

- Shared, resettable synthetic state; not multi-tenant.
- Single region (sjc), single instance. Cold start is a few seconds when the machine scales to zero (currently kept warm with min_machines_running = 1).
- Co-pilot retrieval is tuned for a small roster (tens to low hundreds). At larger scale, move embeddings into a vector index (pgvector) instead of in-process cosine.
- The .ics is one-way (by design). No two-way calendar sync.
- Mutual-friend graph is derived from owned data; contacts-matching is a planned mobile v2.

## Stack and ops

- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind, Prisma + SQLite.
- AI: NVIDIA OpenAI-compatible endpoint (chat + embeddings), with Claude/OpenAI/local fallbacks. Provider shown in the co-pilot UI badge.
- Deploy: Dockerfile + fly.toml. fly deploy builds and ships. Secrets: NVIDIA_API_KEY, SESSION_SECRET (and optional STUDIO_DEMO_PASSWORD).
- Local dev: npm install, npm run db:reset, npm run dev (http://localhost:3009).
