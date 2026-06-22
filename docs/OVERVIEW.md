# Meet Cute - Overview & Handoff

**Live app:** https://meet-cute.fly.dev
**Repo:** https://github.com/jcurtiswolf123/meet-cute
**Studio (operators):** https://meet-cute.fly.dev/studio
**Apply (members):** https://meet-cute.fly.dev/apply

---

## What it is

Meet Cute is an invite-only, matchmaker-run dating service. No swiping. A human
operator (matchmaker) curates one introduction at a time, both people opt in, and
a concierge bot books the first date. It also runs curated group dinners. Think of
it as a premium, high-touch alternative to dating apps, with software doing the
busywork so the matchmaker can focus on judgment.

Two sides to the product:

- **Member app** (`/app`) - what singles use: profile, one curated suggestion at
  a time, mutual opt-in, the concierge that books the date, event RSVPs, vouching,
  and safety/privacy controls.
- **Matchmaker studio** (`/studio`) - the operator back office: vet applicants,
  build matches, run the pipeline, moderate, run events, and an AI co-pilot that
  can actually operate the platform by command.

Members can never see or reach the studio. Every `/studio/*` route redirects
non-operators away, and every operator action is enforced server-side.

---

## Logins

Everyone signs in the same way: a **passwordless magic link** emailed to them.
There is no shared password. An account is an operator (admin) only if its
`isOperator` flag is set, which routes it to the studio.

### Current accounts

| Role | Name | Email |
|---|---|---|
| Operator | Jessica Wolflord | `jesswolflord@gmail.com` |
| Test member | Maya Rosen | `maya@meetcute.test` |
| Test member | Alex Chen | `alex@meetcute.test` |

### Get a one-click sign-in link (no inbox needed)

Useful for testing accounts whose email you don't control. Links are single-use
and expire in 15 minutes.

```bash
cd ~/Projects/meet-cute
npm run login-link -- jesswolflord@gmail.com   # operator -> /studio
npm run login-link -- maya@meetcute.test        # member  -> /app
npm run login-link -- alex@meetcute.test        # member  -> /app
```

Open the three in separate browsers / incognito windows so sessions don't collide.

### Add or remove operators

Self-serve in the studio at **Team** (`/studio/team`): add by email (sends them a
sign-in link) or revoke. Can't remove yourself or the last operator. Or from the
CLI:

```bash
npm run ops -- list
npm run ops -- add you@email.com "Your Name" NYC
npm run ops -- remove someone@email.com
```

---

## Member workflow

1. **Apply** at `/apply` -> enter email -> click the sign-in link.
2. **Complete the application:** name, date of birth (18+ gate), city, what you're
   looking for, consent to Terms + Privacy.
3. An operator **vets and approves** you (`applicant` -> `active`).
4. **Build your profile** at `/app/profile`: headline, bio, looking-for,
   deal-breakers, and photos (reviewed before others can see them).
5. **For You** (`/app`) shows one introduction at a time with the matchmaker's
   note. Choose **Yes, introduce us** or **Not this time**.
6. If both say yes, the **concierge** (`/app/matches`) proposes a venue and time
   slots; when picks overlap it confirms and sends a calendar invite.
7. **Events** (`/app/events`): RSVP to dinners you're invited to.
8. **Settings** (`/app/settings`): block or report anyone, export your data, or
   permanently delete your account and all its data.

---

## Operator workflow

1. Sign in -> land in `/studio`.
2. **Roster** (`/studio`): search/filter members; vet applicants (approve ->
   active, or decline).
3. **Person view** (`/studio/person/[id]`): full history, notes, mutual-friend
   graph; one-click create a suggestion from filtered candidates.
4. **Pipeline** (`/studio/pipeline`): every match from suggested to together.
   Includes a **manual-match override** to force a match between any two members,
   bypassing the candidate filter (blocks and duplicates still respected).
5. **Events** (`/studio/events`): create a dinner, then one-click add invitees
   from the roster (each is emailed automatically); manage RSVP status.
6. **Moderation** (`/studio/moderation`): approve/reject pending photos; resolve
   safety reports.
7. **Co-pilot** (`/studio/copilot`): the platform's command line (see below).
8. **Team** (`/studio/team`): manage operator accounts.

---

## The co-pilot

An internal assistant that both answers questions over the roster and **takes
real actions**. When an `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is set it runs as
a tool-calling agent; otherwise it falls back to a deterministic command parser
plus retrieval. Either way these all work:

- `Match Maya and Alex`
- `Invite Maya and Alex to the next NYC dinner` (adds + emails them)
- `Create a NYC dinner at Via Carota on 2026-07-12 7pm`
- `Book the date for Maya`
- `Approve Maya's photos`
- `Close the match for Maya`
- `Catch me up on Alex` / `Show candidates for Maya` / `What needs my attention?`

Actions are operator-only, resolve names to records server-side, and the agent is
instructed to treat member-authored text as data, never as instructions.

---

## Test scenario

Seed two members and one curated suggestion (reset clean each run):

```bash
npm run test:fixture
```

Then walk it: open Maya's link -> see Alex suggested -> "Yes, introduce us"; open
Alex's link -> "Yes" -> mutual; check Matches for the concierge proposing slots;
open Jessica's link to see it in the studio pipeline.

---

## How it's built

- **Stack:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind, Prisma
  on Neon Postgres. Hosted on Fly.io. Deploys via GitHub Actions on push to
  `master` (typecheck gate, then `flyctl deploy`).
- **Auth:** opaque, revocable sessions (random token, only its hash stored);
  magic-link tokens single-use, hashed, 15-min expiry.
- **Photos:** uploaded images are re-encoded with sharp (strips EXIF/GPS,
  normalizes to WebP), stored in Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set
  (else local disk), served through an auth-gated proxy so unmoderated photos stay
  private.
- **AI:** NVIDIA (free) for the basic co-pilot + embeddings; OpenAI/Anthropic for
  the tool-calling agent and as fallbacks; a local intent engine when nothing is
  funded.
- **Observability:** Sentry (no-op until `SENTRY_DSN` set). Plus a watchdog.

---

## Ops & monitoring

- **Watchdog (local):** `npm run watchdog` monitors live health, DB, typecheck,
  and (hourly) build; alerts by email; with `WATCHDOG_AUTOFIX=1` + an AI key it
  opens a fix PR on a branch (never touches production).
- **Watchdog (CI):** a GitHub Actions workflow runs every 15 minutes and fails
  (notifies) on any regression.
- **Secrets (Fly):** `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`,
  `RESEND_API_KEY`, `NEXT_PUBLIC_APP_URL`, `NVIDIA_API_KEY`, `OPENAI_API_KEY`.
  Optional: `BLOB_READ_WRITE_TOKEN`, `ANTHROPIC_API_KEY`, `SENTRY_DSN`.
- **Schema changes:** `npm run db:deploy` (never via the build).

### To fully turn on at scale

```bash
fly secrets set BLOB_READ_WRITE_TOKEN=...   # multi-instance photo storage
fly secrets set SENTRY_DSN=... NEXT_PUBLIC_SENTRY_DSN=...   # error tracking
```

---

## Known follow-ups

- Photo uploads fall back to single-machine local disk until `BLOB_READ_WRITE_TOKEN`
  is set.
- Nav bars are getting full; a responsive pass would help on small phones.
- Test accounts use `@meetcute.test`; remove them (or run `prod-init`) before a
  real launch.

See also `docs/QUICKSTART.md` for the short version and `docs/PRODUCTION-READINESS.md`
for history.
