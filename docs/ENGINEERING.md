# Working on Mutuals

For a new engineer. Read this before you run anything.

## The one thing that will bite you

**`.env` points `DATABASE_URL` at the production database.** Not a staging copy.
The live roster, real members, real email addresses and phone numbers.

`npm run dev` is safe: it ignores that and runs against a throwaway local
Postgres with every outbound provider key blanked, so it cannot email or text a
real person. But anything you run by hand needs the sandbox environment loaded
first:

```bash
set -a; . ./.env.sandbox; set +a
npx tsx scripts/whatever.ts
```

Use `. ./.env` only when you genuinely intend to touch the live roster, and say
so out loud when you do. There are twelve real members; a bad write is very
visible.

## Getting running

```bash
npm ci
npm run sandbox:up     # Postgres 16 in Docker, migrations, seed data, photos
npm run dev            # http://127.0.0.1:3009
```

Demo login is on locally, so you can sign in as an operator or a member without
email. `npm run sandbox:reset` wipes and re-seeds.

If someone else (or a Claude session) is working in the repo at the same time,
give yourself an isolated copy first. See [SESSIONS.md](SESSIONS.md).

## Where things are

| | |
|---|---|
| `src/app/` | Next.js App Router. `/` public, `/app` members, `/studio` operators |
| `src/lib/actions.ts` | Server actions. Large; most mutations live here |
| `src/lib/delivery.ts` | The outbox worker. Every email and SMS goes through it |
| `src/lib/introductions.ts` | The double opt-in: invite, decision, connect |
| `src/lib/email.ts` | Every template. Rendering is tested, not just typechecked |
| `prisma/schema.prisma` | One schema, `meetcute`, on Neon |
| `scripts/` | Tests, seeds, the watchdog, operator and venue admin |

`CLAUDE.md` in the root is the durable project context and is kept current.
`docs/STATUS.md` is the running log of what changed and why; read the last two
entries before starting anything, because this codebase moves daily.

## Conventions that are not obvious

- **Comments explain why, not what.** Most of the comments here record a defect
  that was hard to find. Do not delete them because they look verbose; that
  context is the reason the bug has not come back.
- **Refusals redirect, they do not throw.** A server action that throws hits the
  global error boundary and shows an operator "Something went sideways" with no
  reason, and logs a Sentry issue per click. Return a short code in the query
  string and render copy for it. See `intro-notice.ts`.
- **Never claim a booking.** Mutuals holds no tables. Venue links go to the
  venue's own site. A test asserts four phrasings of "we booked it" never appear.
- **Facts come from the database, voice can come from a model.** The date-ideas
  feature lets an LLM write prose but only lets it reference venue ids from a
  shortlist, so it cannot invent a restaurant. Keep that split if you extend it.
- **First names before a decision, whole names after.** Someone deciding whether
  to meet you should not be able to look you up first; once both said yes they
  are about to meet.

## Shipping

```bash
npm run test:launch    # the whole suite; needs the sandbox env loaded
npm run build
```

Push a branch, open a PR, merge to `master`. CI runs the suite and deploys to
Fly automatically. You do not need Fly credentials to contribute.

**The operator-portal browser check is a known flake**, roughly one run in three,
failing at `scripts/test-operator-portal.ts:212` with `page.waitForURL: Timeout`.
If that is the only red check, `gh run rerun <id> --failed`. If it fails twice on
the same commit, it is not the flake and needs a look.

## Monitoring

`scripts/watchdog.ts` runs in CI every 15 minutes: liveness, readiness, the
database, the delivery queue, the inbound-email webhook, venue freshness, and a
typecheck. A red typecheck also triggers an AI fix attempt that opens a PR on a
branch. **Those PRs are never merged automatically and should not be merged
without reading the diff** — a patch that compiles by coercing a type rather
than fixing the mistake is the common failure, and it looks resolved.

Sentry is wired for both client and server. The board is kept clean on purpose:
if you add capture, make sure it captures something actionable.
