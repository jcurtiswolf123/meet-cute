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

    Workspace   Matchmaking, Matches, Applicants (badge), Directory
    Manage      Delivery, Events, Team
    Header      Co-pilot, New match

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

## Verification

- typecheck, lint, production build
- `npm run test:launch`
- `npm run test:launch:roles:e2e` (operator portal, sidebar collapse)
- browse-daemon screenshots of all seven studio pages at 1440x900 and 390x844,
  before and after, in `docs/qa/`
