# Meet Cute: how to use and run it

Premium matchmaking web app. NYC and SF. Members apply, get vetted, and are
introduced one person at a time; a concierge bot books the first date.

## For members

1. Go to https://meet-cute.fly.dev and tap "Request an introduction" (or /apply).
2. Enter your email; we send a one-time sign-in link (no password, 15 min, single use).
3. Complete your application: name, date of birth (18+), city, what you are
   looking for, and agree to the Terms and Privacy Policy.
4. Once active, you see one introduction at a time in the app: say "Yes,
   introduce us" or "Not this time." On a mutual yes, the concierge books a table
   and sends both of you the time and a calendar invite.
5. In the app you can upload photos (reviewed before they go live), report or
   block anyone, download your data, or delete your account (Settings).

## For operators (matchmakers)

Full guide: `docs/OPERATOR-GUIDE.md`. Short version:

- Sign in at /login with your operator email, land in the Studio.
- Tabs: Roster, Pipeline, Moderation (approve photos + handle reports, daily), Co-pilot.
- The Co-pilot takes plain-English actions, not just answers:
  - "what needs my attention" -> queue summary (photos, reports, bookable matches, stale singles)
  - "suggest Maya and David" -> creates the pairing
  - "book the date for Maya" -> confirms a table, sends invites, advances the pipeline
  - "approve Maya's photos" -> approves her pending photos
  - "close the match for Maya" -> ends a match
  - "note on Maya: ..." -> logs to her file
  - plus "find candidates for David", "summarize Maya", "who haven't we introduced in 60 days"

## Running it locally

```bash
npm install
# .env needs DATABASE_URL + DIRECT_URL (Neon Postgres). For local demo login also
# set MEETCUTE_DEMO_LOGIN="1".
npx prisma db push        # sync schema to your database
npm run db:seed           # seed a synthetic roster (resets tables)
npm run dev               # http://localhost:3009
```

With `MEETCUTE_DEMO_LOGIN=1` and not in production, /login shows a demo picker so
you can sign in as any seeded member or operator without email.

## Architecture and ops

- Next.js 16 (App Router) + React 19 + Prisma + Neon Postgres (schema `meetcute`).
- Auth: passwordless email magic-link, opaque revocable sessions (Session table),
  hashed single-use login tokens. Email via Resend.
- AI co-pilot: NVIDIA Llama (Claude/OpenAI/local fallbacks) for RAG + a
  deterministic operator-action layer (`src/lib/operator-actions.ts`).
- Concierge: `src/lib/concierge.ts`; run `scripts/concierge-tick.ts` on a 15-min
  cron (Fly scheduled machine) in production.

### Deploy (Fly.io)

```bash
fly deploy        # builds, runs `prisma db push` once via release_command, ships
```

Required Fly secrets: `DATABASE_URL` (Neon pooled), `DIRECT_URL` (Neon direct),
`RESEND_API_KEY`, `RESEND_FROM` (a Resend-verified domain), `NEXT_PUBLIC_APP_URL`,
`STUDIO_DEMO_PASSWORD`. Do NOT set `MEETCUTE_DEMO_LOGIN` in production.

### Before opening to the public

See `docs/PRODUCTION-PLAN.md`. Outstanding: counsel review of the draft
Terms/Privacy, an automated photo pre-moderation filter, a shared rate-limit
store (Upstash) before running more than one instance, a dedicated Neon project,
Twilio for real concierge messaging, and Sentry/observability.
