# Meet Cute Overview and Handoff

Last updated 2026-07-23.

- Live app: `https://hellomeetcute.com`
- Repository: `https://github.com/jcurtiswolf123/meet-cute`
- Operator studio: `https://hellomeetcute.com/studio`
- Public application: `https://hellomeetcute.com/apply`

## Product

Meet Cute is a matchmaker-run dating service. A human operator reviews
applications, curates one introduction at a time, and monitors delivery and
safety. Each member privately accepts or passes. A mutual yes opens a connection
using currently authorized contact information.

Venue selection, reservations, and calendar coordination are manual.

## Authentication and authorization

Everyone uses a single-use email magic link. Sessions are opaque, revocable
database records. Operator access is controlled by `isOperator` and enforced in
server actions and every Studio route.

Production has no demo login. Local demo login is available only when explicitly
enabled outside production.

## Member workflow

1. Apply at `/apply`.
2. Complete the adult, terms, privacy, and optional SMS-consent steps.
3. Wait for operator review.
4. Complete a profile and upload photos for moderation.
5. Review one curated introduction and choose yes or pass.
6. On a mutual yes, receive the connection handoff.
7. Use settings to report, block, export data, or delete the account.

## Operator workflow

1. Review applicants and member profiles in the Roster.
2. Create suggestions and manage the Pipeline.
3. Moderate photos and safety reports.
4. Review delivery failures and retry only after resolving the cause.
5. Create and manage dinners with transactionally enforced capacity.
6. Use the co-pilot for supported roster, note, match, moderation, and dinner
   actions.
7. Coordinate dates manually after mutual connections.

## Architecture

- Next.js 16, React 19, TypeScript, Tailwind CSS
- Prisma and Neon PostgreSQL, schema `meetcute`
- Two always-on Fly machines with rolling deployment
- Vercel Blob or Postgres-backed shared photo storage
- Database-backed email and SMS delivery outbox
- Resend and Twilio or Telnyx integrations
- Sentry and a scheduled watchdog

Delivery workers fence claims, recheck authorization at send time, and avoid
automatic retry after an ambiguous SMS outcome.

## Operations

GitHub Actions applies checked-in Prisma migrations, runs database release
tests, deploys the standalone Docker image, and checks liveness and readiness.
See:

- `README.md`
- `DEPLOYMENT.md`
- `LAUNCH-CHECKLIST.md`
- `docs/OPERATOR-GUIDE.md`
- `docs/OBSERVABILITY.md`
- `docs/STATUS.md`

## Known follow-ups

- Obtain counsel review of legal and consent language.
- Add automated photo pre-screening before high upload volume.
- Complete the branded inbound email-domain DNS change when access is available.
- Retire unused legacy Fly volumes during a planned maintenance window.
