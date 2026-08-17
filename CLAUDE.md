# mutuals

Premium matchmaking with public applications, a member app, and an operator studio.

> This file is auto-loaded by Claude Code at the start of every session in this
> folder. Keep it current. It is the durable, deterministic context for this
> project, not chat memory. Detailed living docs are in `docs/`.

## What this is
- Purpose: Operate a curated matchmaking service from application through introduction.
- Status: LIVE as of 2026-07-23. See `docs/STATUS.md` and `docs/LAUNCH-QA-2026-07-23.md`.
- Owner: Joshua Wolf

## Stack and key paths
- Language / framework: TypeScript/Node (Next.js, Tailwind, LLM)
- Entry point: src/app/ (Next.js App Router)
- Deploy target / live URL: Fly.io at https://hellomutuals.com
  (`hellomeetcute.com` and `meetcutehq.com` still resolve and 308 there)
- Important dirs/files: src, scripts, docs, public, prisma

## How to run
```bash
npm ci
npm run dev            # sandbox: throwaway local database, :3009
npm run test:launch
npm run build
```

`npm run dev` is a **local throwaway database**, not production, and every
outbound provider key is blank so it cannot email or text a member. The repo's
`.env` still points `DATABASE_URL` at the production Neon branch, so anything
that talks to a database needs `set -a; . ./.env.sandbox; set +a` first. Use
`. ./.env` only when you actually intend to touch the live roster, and say so
out loud when you do. `npm run dev:live` (:3019) is the deliberate way to point
a dev server at real data.

## How to deploy

```bash
export FLY_API_TOKEN=$(sed -n 's/^access_token: //p' ~/.fly/config.yml)
npm run deploy                      # never a bare `flyctl deploy`
curl -s https://hellomutuals.com/healthz   # {"ok":true,...,"commit":"<sha>"}
```

`flyctl` on this Mac does not pick `~/.fly/config.yml` up from a scripted shell,
and the tokens in `~/.gstack/credentials/` are the wrong org.

**Deploy from master, and only forward.** Three sessions deployed this app from
three checkouts on 2026-08-16 and production twice lost work that was already
live, because `flyctl deploy` ships whatever tree it is pointed at. `predeploy`
now runs `scripts/deploy-guard.ts`, which reads the live commit off `/healthz`
and refuses a HEAD that does not contain it, and refuses a dirty tree.
`DEPLOY_ALLOW_ROLLBACK=1` and `DEPLOY_ALLOW_DIRTY=1` are the deliberate ways
past. A bare `flyctl deploy` skips the guard entirely, which is the reason not
to use one.

## Working alongside other sessions

**If another Claude session might be working in this repo, start your own
worktree before you touch anything:**

```bash
npm run session:new <short-name>   # worktree + branch + database + port
npm run session:list               # who is where, and what is dirty
npm run session:end <short-name>   # refuses to run if you have uncommitted work
```

Three sessions shared this one checkout on 2026-08-03 and every failure that day
came from it: an in-flight edit swept into someone else's commit and shipped, a
typecheck run against a half-written file, `prisma generate` breaking another
session's types, two dev servers fighting over one Next daemon, and a branch
merged out from under the session that made it.

A worktree gives you your own index, HEAD, files, database, and port. Inside
one, `git add -A` is safe again because it can only see your own tree.

If you are the only session, the main checkout is fine and nothing changes.

## Conventions
- Neon Postgres is production. Development uses the sandbox (`npm run dev`).
  Never run a database script without printing the target host first.
- Never stage a whole file another session may be editing. Inside your own
  worktree this is a non-issue; in the shared checkout it is how an unfinished
  nav link reached production.
- Production has two Fly machines. Uploads use Vercel Blob when configured and
  otherwise use Postgres, so no upload depends on one machine.
- Demo login is local development only.
- An application is accepted by **any two friends** writing recommendations, not
  by submitting the form. It was two friends of the opposite gender until
  2026-08-06; nothing reads gender as a gate now. See
  `src/lib/recommendations.ts` and `docs/DECISIONS.md`. Operator approval still
  works and is now the exception. A photo is required to apply.
- Somebody can also be put forward by a friend at `/refer` before they have
  applied. A nomination carrying real words becomes an answered recommendation
  when the nominee applies, so they are asked for one friend rather than two.
  See `src/lib/nominations.ts`.
- Every select and checkbox on a form driven by `useActionState` must be
  controlled. Uncontrolled ones reset on the re-render after a failed submit.
- No native `<select>` anywhere: its popup is OS chrome. Two to five options use
  `ChoiceGroup`, longer lists use `Select`, checkboxes use `Checkbox`, all in
  `src/components/`. See the Form controls section of `DESIGN.md`.
- Email magic links are shared authentication. `isOperator` grants studio
  access, while `isSuperAdmin` grants only operator-account management.
- Introduction delivery uses a database outbox with fenced workers, retries,
  authorization checks at send time, and operator-visible failure state.
- Venue booking and calendar coordination are manual. Do not claim they are
  automated.
- The studio rail is seven items and two of them may not draw the same rows.
  Views of one object are tabs on that object's page (Matches: In flight /
  Pipeline / History; Events: Dinners / Venues), and tools live in the header,
  not the rail. Two labels may not share a root word: **Introduce** is the act
  and **Matches** is the record, which is why the composer page is not called
  Matchmaking. The `?view=` keys stay `live` / `board` / `all` whatever the
  labels say, because the redirects point at them.
  `/studio/conversations`, `/studio/pipeline` and `/studio/venues` are redirects
  and must stay that way. See `docs/STUDIO-STREAMLINE-2026-08-16.md`.
- The site installs to a phone home screen as a PWA. The service worker in
  `public/sw.js` may cache static build output only: every HTML response here is
  signed in and personalised, so caching a navigation would serve one member's
  page after sign-out. Icons are generated by `scripts/make-app-icons.ts` and
  committed.
- **On a phone, sign in with the six-digit code, not the emailed link.** An iOS
  home-screen web app has its own cookie store, so a link tapped in Mail signs
  in Safari and leaves the installed app signed out, with no way out of the
  loop. `createLoginCode` in `src/lib/auth.ts` mints the code as an ordinary
  LoginToken row scoped to the address. Never widen the guess budget: six digits
  are only safe because of the rate limits in `signInWithCode`.
- `src/app/api/mobile/*` is the iOS shell's half of the contract and has to be
  deployed for the app to draw anything. The shell asks `/api/mobile/session`
  before it renders, and a production build without it puts "hellomutuals.com is
  running a build without the app endpoints" on the phone. The sending logic for
  `/login` and `/api/mobile/login` is shared in `src/lib/magic-link.ts` on
  purpose: two transports, one set of rate limits and one link-origin rule.
- `ios/` is a native shell around the same site, built with XcodeGen: its own
  sign-in screen, member and studio tabs, a `window.mutuals` bridge, and web
  views underneath. It was replaced by a 200-line WKWebView wrapper on
  2026-08-16 and restored the same day. The signing team is a **free personal
  team**, so a build lasts 7 days and cannot be given to anyone else, and a
  build that is going to leave the house must be on `Backend.production`, never
  the Mac's dev server. Read `ios/README.md` before building or promising it.

## Design system
- Read `DESIGN.md` before making any visual or UI decision.
- Keep public marketing work aligned with its typography, palette, spacing,
  layout, motion, and copy rules.
- Do not deviate from the public design direction without explicit approval.
- In visual QA, flag code that does not match `DESIGN.md`.

## Context map (read these for state)
- `docs/STATUS.md` : current state, what's next, blockers
- `docs/STUDIO-STREAMLINE-2026-08-16.md` : why the rail is seven items, what
  folded into what, the mobile fixes, and how to install the app on a phone
- `docs/EMAIL-TESTING.md` : how to test the reply-by-email match path, including
  against real inboxes
- `docs/DELIVERABILITY.md` : where each template actually lands in Gmail, the
  domain's DNS and authentication state, and `scripts/placement-check.py`
- `docs/REHEARSAL.md` : walking the whole introduction flow on the live site with
  Jess and two member accounts
- `docs/APPLICATION-FLOW.md` : every step from /apply to an accepted member,
  and every email that leaves along the way
- `docs/DECISIONS.md` : why things are the way they are
- `docs/TASKS.md` : backlog and in-progress work
- `docs/BRAND-RENAME.md` : the Meet-Cute to Mutuals rename, which deployment
  identifiers still carry the old name, and the cutover order
- `docs/SESSIONS.md` : running several Claude sessions on this repo at once
- `docs/ENGINEERING.md` : onboarding for a new engineer, and the traps

_Created 2026-06-24._
