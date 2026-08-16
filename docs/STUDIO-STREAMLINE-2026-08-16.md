# Studio streamline, mobile QA, and phone install : 2026-08-16

Single source of truth for this pass. Three jobs, in order.

## 1. The sidebar had four ways to look at a match and three ways to make one

Measured on the sandbox (59 people, 36 applicants, 5 matches), 2026-08-16.

Eleven nav items. What each page actually renders:

| Item | Renders | Verdict |
|---|---|---|
| Matchmaking | composer, quick-add, **live introductions board with actions**, **whole people table** | keep the composer, strip the two duplicates |
| Conversations | live introductions, health badge, opt-in, last activity, bulk resend/close | fold in as Matches -> Live |
| Matches | read-only ledger of every introduction, grouped | fold in as Matches -> All |
| Status (pipeline) | kanban of all 8 stages, plus a **second suggest-a-pair composer** | fold in as Matches -> Board |
| Applicants | face wall, three tabs, approve/decline | keep |
| Directory | roster table, **a third composer**, blockers | keep |
| Delivery | outbox log | keep |
| Events | dinners, new-event form | keep, absorbs Venues |
| Venues | venue rows, verify/retire | fold in as Events -> Venues |
| Co-pilot | one chat box | move to the header, it is a tool not a place |
| Team | operator accounts | keep |

Live introductions were rendered on two pages with different actions on each:
Matchmaking had Resend / Connect now / Close / Ask for feedback / Follow up,
Conversations had health, opt-in, last message and the transcript link. Neither
was complete, so an operator had to hold both in their head.

**After: seven nav items.**

    Workspace   Introduce, Matches, Applicants (badge), Directory
    Manage      Delivery, Events, Team
    Header      Co-pilot, New introduction

## The first cut of the names was still five ways of saying match

Joshua, on the first pass: "isn't it confusing to have three tabs named match".
It was. The rail said Matchmaking next to Matches, the header said New match,
and the tabs were Live, Board and All, which name a rendering rather than a
thing. Five labels off one root and an operator has to read the page to work out
which is which.

The product already has two different nouns for two different jobs, and the send
button has used one of them since 8/9: it reads "Introduce Ben and Sofia".

    Introduce    the act. Pick two people, send. The composer, nothing else.
    Matches      the record. Every pair, whatever state it is in.
      In flight  sent, waiting on a decision
      Pipeline   every open pair, by stage, oldest first
      History    everything ever, closed included

No word appears twice. The `?view=` keys stay `live` / `board` / `all`, because
they are what the redirects from `/studio/conversations` and `/studio/pipeline`
point at and a label should not be able to break a bookmark.

`/studio/conversations`, `/studio/pipeline` and `/studio/venues` are 307
redirects to their new tab, so every link in `actions.ts`, the co-pilot, the
docs and anybody's bookmarks still lands.

## 2. Mobile

Found at 390x844 (iPhone 14) against every studio page.

- **The ledger strip stacked into a narrow column.** `.ledger` was
  `flex-col sm:flex-row`, and every use sits inside a `flex-wrap justify-between`
  header, so on a phone three numbers became a tall thin column against half a
  screen of dead space. Now a 2-up grid below `sm`, full width.
- **Two tables ran off the right edge with no affordance.** Conversations and
  the pipeline roster. The Live view is card rows now; the board keeps a scroll
  container with an explicit min width.
- **Events led with a form.** The new-event form was above the events, so on a
  phone you scrolled a whole form to reach what you came for. Collapsed into a
  disclosure, matching the quick-add on Matchmaking.
- **The mobile bar said "Mutuals" and nothing else.** The page name is only in
  the desktop header, which is `hidden md:flex`, so a phone had no context.
- Safe-area insets, so a standalone install does not paint under the notch or
  the home indicator.

## 3. Installing it on a phone

The app is a website, so the install is a PWA, not a cable. Added
`src/app/manifest.ts`, maskable icons, the Apple meta tags iOS needs, a
`viewport-fit=cover` viewport, and a small service worker with an offline
fallback.

To install, on the phone itself, with no computer involved:

1. Safari on the iPhone, go to **hellomutuals.com/app** (Chrome on Android works
   the same way).
2. Share, then **Add to Home Screen**.
3. It launches full screen with its own icon and stays signed in. It works
   anywhere, on cellular, with the laptop shut: the app runs on Fly, not on the
   Mac.

The cable is only needed to test a build that has not been deployed yet. For
that, `npm run sandbox` prints a LAN URL and the phone must be on the same
Wi-Fi; iOS will not install a PWA from a plain-http origin, so test the layout
over LAN and install from the deployed site.

## Two content defects found on the way

Both on the member profile, both wrong rather than ugly.

- **"New photos are reviewed before they appear to others."** Untrue since
  2026-08-03, when the moderation queue was deleted and `/api/photos` started
  writing `approved`. It told a member their face was being checked while it was
  already on an invitation going out. Now: a photo goes live on upload and the
  first one leads the introduction.
- **"NYC ·"** with nothing after it. Neighbourhood is optional and most rows have
  none; the separator was interpolated rather than joined.

## One test was broken, and it was hiding behind a known flake

`test-operator-portal.ts` failed on the second invite. Not a regression: the
Team page is untouched by this work. The two fallbacks that cover the flaky
post-action navigation asked whether the URL carried **an** `operator=` at all.
It always does after the first invite, so on the second the fallback was skipped
as unnecessary, the page still showed the first operator's flash, and the
assertion waited 60 seconds for text that could never render. Both accounts had
been created correctly. Replaced with `ensureFlashFor(page, name)`, which asks
for the name it is about to assert on.

## Verification

All run on this branch, against the sandbox database, 2026-08-16.

- `npm run typecheck`, `npm run lint`, `npm run build`: clean.
- `npm run test:launch`: 24 suites, all pass.
- `npm run test:launch:roles:e2e`: passes, including the sidebar collapse
  assertions, after the guard fix above.
- `/studio/conversations`, `/studio/pipeline` and `/studio/venues` each land on
  their new tab, checked in a browser with a real session.
- No page overflows 390px horizontally, studio or member.
- Service worker: caches exactly `offline.html`, the icons, the fonts and the
  content-hashed chunks, and **no HTML**, asserted by reading the live cache.
  With the server stopped, `/app/connections` served the offline page rather
  than a browser error.
- Before and after screenshots at 390x844 and 1440x900 in `docs/qa/2026-08-16/`.

### Deployed, and checked live

Fly **v225**, both `iad` machines started and health-checked, 2026-08-16 23:19Z.
Rollback point is **v224**: `flyctl releases -a meet-cute`, then
`flyctl deploy --image <the v224 image>`. No migration went out with this, so a
rollback is code only and the schema needs nothing.

On hellomutuals.com after the deploy:

- `/healthz` and `/readyz` 200 in ~0.2s. Eight public routes 200.
- `manifest.webmanifest` serves as `application/manifest+json` and parses:
  name Mutuals, `start_url` /app, display standalone, 4 icons. `sw.js`,
  `offline.html` and every icon 200.
- The service worker registers at scope `/`, and the only non-asset thing in its
  cache is `offline.html`. No page HTML.
- `/studio/pipeline` lands on `/studio/login` in a real browser. Unauthenticated
  studio responses carry no sidebar, no roster and no match rows.
- No error lines in the app log after the release.

### One gotcha for whoever deploys next

`flyctl` on this Mac does not pick up `~/.fly/config.yml` from a scripted shell:
`flyctl auth whoami` says "no access token available" while the token is sitting
in that file. Read it out and pass it explicitly:

```bash
export FLY_API_TOKEN=$(sed -n 's/^access_token: //p' ~/.fly/config.yml)
npm run deploy
```

The tokens in `~/.gstack/credentials/` are the wrong ones: `fly-api-token.txt` is
expired, and the joinhandshake and crown tokens authenticate but answer
`Could not find App "meet-cute"` because the app is in the personal org.

## Still open

- The mobile drawer carries Co-pilot under a "Tools" heading. If more tools
  arrive it wants to be a sheet, not a nav section.
- `/studio/matches?view=board` still renders a table at `md` and up. It is the
  right shape for eight columns of stage data, but it is the last table in the
  studio that a narrow laptop can scroll sideways.
