# mutuals : Decision Log

_Append-only. Newest at top. Each entry: what was decided, why, and what was rejected._

## 2026-08-04 : AI autofix is reliable now, not just once-lucky

- Correction to the 2026-08-03 entry below, and to commit f1defcc, which both
  say autofix "had never" produced a patch and "still produced zero" after that
  day's fixes. Not true: the 2026-08-03 drill did open a PR
  (`watchdog/fix-1785774233550`). What was true is narrower and worse: it worked
  once and did not work again. Re-drilling the same deliberate error the next
  day produced zero patches over repeated runs, because the model chose a
  different reply shape and one shape was all the parser could read.
- Root cause, found by reading what the model actually replied: `<<<EDIT` and
  `>>>END` read as diff gutters. The model answered in diff form nearly every
  time,
  prefixing lines with `<` and putting the search text above the SEARCH marker.
  It knew the correct fix on every attempt and could not say it in a shape the
  parser would read.
- Decision: the markers are `[EDIT path]`, `[SEARCH]`, `[REPLACE]`, `[END]`,
  and the prompt says outright that this is not a diff. The old markers still
  parse.
- Decision: tolerate what models reliably get wrong, never what would make an
  edit ambiguous. A uniform `+`/`-`/`>` gutter is stripped. `[SEARCH]` and
  `[END]` are optional. A search that fails character-for-character is retried
  ignoring horizontal whitespace only, and accepted solely when it still matches
  exactly once. Two candidate sites is still a refusal.
- Decision: three attempts, each told precisely what was wrong with the last:
  no usable block, a block that restated the whole file, a search matching twice,
  a patch over the churn budget. One shot per regression is what made this a
  coin flip: the model gets the shape wrong differently each run, and every one
  of those is a complaint this code can now state exactly.
- Decision: the diff size is measured before a branch is created, so an
  oversized patch becomes feedback rather than a discard.
- Decision: the replacement takes the file's indentation line by line, so the
  diff a human reviews is the change and not a reformat.
- Proved: a live drill against the funded provider produced a correct one-line
  fix, re-verified by tsc, at 2 changed lines, and opened PR #41. Closed, since
  the error was deliberate.
- Every reply shape above is now a case in scripts/test-autofix-patch.ts, so the
  next model that answers in diff form is a test failure and not another quiet
  two months of a green workflow doing nothing.

## 2026-08-04 : An unused sign-in link is followed up once, with no token in it

- Decision: Asking for a sign-in link schedules one follow-up, due three hours
  later, withdrawn the moment the person signs in.
- Why: this was the last hole in the funnel and the only one where the person
  was completely invisible. A Person row is created when a link is CLICKED, so
  somebody who asked for one and lost it left nothing but a LoginToken that
  expired in fifteen minutes. Nothing in the product knew they had ever tried.
- Decision: keyed on the email address alone, so asking for three links in a row
  still produces at most one follow-up, ever.
- Decision: the email carries NO sign-in token. It links to the application form
  with the address prefilled, and they ask for a fresh link themselves.
- Why: the link we sent expired in fifteen minutes on purpose. Minting a fresh,
  longer-lived token into an inbox nobody has proven they can read is how a
  magic-link system turns into an account-takeover system. Prefilling an address
  grants nothing, because the thing that actually signs someone in is still
  emailed to it.
- Note for whoever adds the next constant: src/lib/actions.ts carries
  "use server" and may only export async functions. Exporting a number from it
  compiles, type-checks, lints, and then returns 500 on every render. The delay
  constants live in src/lib/recommendations.ts for that reason.

## 2026-08-04 : The application is two halves with a real save between them

- Decision: `/apply` saves everything about the applicant on its own and stamps
  `basicsAt`. `/apply/friends` names the two friends and stamps `appliedAt`,
  creates the recommendation rows, and sends the asks.
- Why: leaving used to cost everything. On 3 August, 18 people completed an
  application and 18 signed in and never did, seven of them after uploading
  photos, and every one of those left exactly the same trace as somebody who
  closed the tab immediately: none. Now a person who stops is a person with a
  name, a city and a face, which is somebody you can write to.
- Decision: `basicsAt` and `appliedAt` are different fields on purpose.
  `appliedAt` still means "completed an application a matchmaker can act on"
  and still powers the accept-rate metric, so half-finished people never appear
  in the review queue or inflate the denominator.
- Decision: the studio shows them separately, as "Stopped at the friends", with
  what they have and whether they have been chased. They are not to-review and
  they are not noise.
- Decision: the chase email reads the half they reached. Someone who saved their
  details is told two names are all that is left and is landed on
  `/apply/friends`, not sent back to the beginning to retype what they gave.
- Alternatives rejected: setting `appliedAt` at the halfway point (it would
  break the metric and put unreviewable people in the queue); a draft table
  (the Person row is the draft, and a second store means two sources of truth
  for the same person).

## 2026-08-04 : Nobody has to make an account to do a friend a favour

- Decision: Vouching requires no account, no session, and no sign-in, and a test
  asserts it three ways rather than leaving it to good intentions.
- Why it needs guarding: it is the most load-bearing property of the loop and
  the easiest to lose by accident. Someone adds `requireMemberPage()` to the
  friend's page for tidiness, or wraps the action in the auth helper every other
  action uses, and nothing errors. Reply rate just falls to nearly zero, because
  a friend doing someone a favour will not create an account to do it, and the
  applicants they were asked about stop getting in.
- The test checks the vouch surfaces contain no auth helper at all, that the
  page opens and records a vouch in a browser with no cookies, and that two
  non-members can accept an applicant without either of them getting a row.

## 2026-08-04 : An unfinished application gets chased once

- Decision: Signing in as an applicant queues one chase, due a day later,
  withdrawn the moment they submit. Same shape as the recommendation nudges: the
  outbox `availableAt` is the schedule, so there is no cron and nothing has to
  go looking for people.
- Why: on 3 August, 18 people completed an application and 18 signed in and
  never did. Seven of those had already uploaded photos, so they had done the
  part most people find hardest and stopped before the part that takes a minute.
  Not one of them was ever contacted. That is a 50% drop-off with no follow-up
  at all.
- Decision: The email names what they already did ("you uploaded 5 photos and
  they are still saved") and what is actually left, which is short. Someone who
  was nearly finished is not a lead to re-pitch.
- Decision: Once. `unfinishedNudgedAt` records it, so a second run of the
  backfill cannot chase the same person twice.
- Alternatives rejected: a cron that scans for stale applications (the outbox is
  already a scheduler); a drip (they signed in once and stopped, which is a
  signal, not an invitation).

## 2026-08-03 : Three doors into one vouch, and a tap is an answer

- Decision: A friend can answer by replying to the email, by tapping once, or by
  writing on the page. All three go through `recordAnswer`, which is the only
  place the transition is written.
- Why three call sites doing it by hand is the risk: one of them quietly stops
  cancelling the nudges, or stops accepting the applicant, and nothing notices.
- Decision: A tap sets `endorsed` and counts toward the gate. Words set
  `submitted` and can upgrade an earlier tap. Words never overwrite words.
- Decision: Only a row with a body is ever quoted on a profile or in an
  introduction email. Two taps accept an applicant and leave the quote empty.
- Why: most people answering are on a phone, and the gap between a tap and a
  paragraph is the gap between an answer today and no answer at all. But a tap
  is consent, not prose, and putting words in a friend's mouth would be worse
  than having none.
- Decision: The one-tap vouch is a button on the page, never a link in the
  email. Mail scanners follow links, and a scanner must never be able to vouch.
- Decision: Recommendation replies are routed in the inbound webhook BEFORE the
  Y/N decision parser sees them. The message is the answer, not a decision.
  Under 40 characters is ignored rather than guessed at.
- Decision: Nudges at two, five, and ten days, withdrawn on any answer.
- Alternatives rejected: a one-click vouch URL in the email (scanners); letting
  a tap fill in a generic quote (inventing words nobody said); counting a short
  reply like "yes!" as a recommendation (it is an endorsement at best, and the
  page and nudges are still open to them).

## 2026-08-03 : The recommender loop, and why recommenders do not sign up first

- Decision: A recommender is never asked to create an account before writing.
  The vouch comes first, the offer comes second.
- Why: gating the vouch behind a signup loses most of the vouches, and then the
  applicant they were asked about cannot get in either. The first real
  recommender wrote back ten minutes after being asked, with nothing to join.
  That is the number the whole gate depends on and it is not worth trading.
- Decision: Someone who has already vouched for a member needs one new friend,
  not two. The member they vouched for counts as the other, and is asked to
  vouch back. The opposite-gender rule still applies to the credit, and vouching
  for someone who was declined earns nothing.
- Why: it is the honest version of an incentive. Someone a member's own circle
  vouched for is exactly who this network wants, and the evidence already
  exists. Halving the work raises the one term the loop actually multiplies:
  how many recommenders become members.
- Decision: `Recommendation.convertedPersonId` stamps who a recommender became.
  Nothing attributed a signup to a recommendation before, so the funnel could
  not be measured at all.
- Decision: The nudge and the follow-up are queued into the future on the
  outbox's own `availableAt` and withdrawn when they stop being needed. No cron.
  The scheduler that already exists is the schedule.
- Decision: Exactly one follow-up email to a recommender, 36 hours after they
  write, and only if they have not already applied. No drip, no list. It is the
  only mail Mutuals sends to someone who did not ask to hear from it, and it
  earns the send by reporting the outcome of what they did.
- Decision: Approving an applicant whose friends have not written requires a
  reason, recorded on `Person.acceptOverrideReason` with `acceptedById`.
- Why: on the day the gate shipped, both applicants were approved by hand within
  an hour, so three of their four recommenders had no reason to write and the
  loop had no fuel. The override stays possible and stops being invisible.
- Not claimed: that this is a viral loop. Two recommenders per member at a 50%
  reply rate needs 100% conversion to sustain itself. It is an amplifier on
  acquisition cost and a source of unusually warm leads, not exponential growth.
- Alternatives rejected: requiring signup before vouching (kills the vouch);
  asking recommenders to name more people (cold-emailing addresses nobody
  volunteered is how a 10/10 sending domain stops delivering).

## 2026-08-03 : No native selects, and short choices are pills

- Decision: A native `<select>` is not used anywhere in the product. Two to five
  options become `ChoiceGroup` radio pills; longer lists and dense studio
  toolbars become the `Select` listbox we draw ourselves. Checkboxes become
  `Checkbox`.
- Why: Joshua, looking at the gender field on `/apply`: the popup is drawn by
  the operating system, in the system accent, and no amount of styling reaches
  it. Beyond the look, a three-option popup is the wrong control: it costs a
  click to open and hides the alternatives while you decide.
- Decision: The pills are real radio inputs, visually hidden, rather than
  buttons with a hidden input. Arrow-key movement inside the group, the label
  hit area, and the "radio, 2 of 3" announcement all come from the browser, and
  all of them silently disappear the moment someone rebuilds this out of
  buttons. `scripts/test-form-controls.ts` asserts the markup stayed a radio
  group for exactly that reason.
- Decision: Native date and file inputs stay native. The mobile date wheel and
  the system file chooser are better than anything we would build; only the
  chrome around them is restyled.
- Not claimed: that any of this works with JavaScript disabled. The radio markup
  would post fine, but every page renders behind the Suspense fallback in
  `src/app/loading.tsx` and Next reveals streamed content with an inline script,
  so with scripting off an applicant never gets past the spinner.
- Alternatives rejected: styling the native select (the popup is not ours to
  style); a headless component library (one listbox and one radio group is not
  a dependency); keeping selects in the studio only (the operator deserves the
  same control, and the toolbar reads better for it).

## 2026-08-03 : Two friends of the opposite gender let you in, not a form

- Decision: An application is not accepted when it is submitted. The applicant
  names two friends of the opposite gender, Mutuals emails them, and the second
  one to write back accepts the applicant automatically.
- Decision: The friend needs no account and no session. The token in the request
  email is the capability: single-purpose, unguessable, and it stops accepting
  writes once answered so a forwarded link cannot overwrite what was written.
- Decision: What the friends write goes on the applicant's profile and is
  read-only to the member. The first one is copied onto `Person.recommendation`
  and `Person.voucherName` so the introduction email, the invite page, and the
  studio profile keep reading one field.
- Decision: A photo is required to submit.
- Decision: Gender is collected at application. It was never asked before, and
  every one of the 25 people on the roster had a null gender, so the matchmaker
  filter had nothing to filter on and the opposite-gender rule had nothing to
  check against.
- Decision: For a nonbinary applicant the count still applies and the
  opposite-gender constraint does not.
- Why: Joshua's ask on 2026-08-03. Two people who know you are worth more than
  anything you can write about yourself, and the growth flywheel is the point:
  the only way in is to ask two people to vouch for you, so every accepted
  member has already told two people what Mutuals is. Half the roster had no
  photo, so half the introductions went out with initials where a face should
  be.
- What this replaces: the applicant typing what they imagined their friend would
  say, next to a name and a phone number nobody ever called.
- Alternatives rejected: keeping operator approval as the accept step (it is
  still there and still works, but it is no longer what normally accepts
  someone); requiring the friend to sign in first (most of them would not);
  inventing an "opposite" for nonbinary applicants (that is a bug with a policy
  attached); blocking the submit itself until recommendations exist (the app has
  to know who to email before it can ask anyone).
- Reversible?: Additive migration. Nothing is dropped, no accepted member is
  re-gated, and applicants who applied before it are still accepted by an
  operator on the Studio profile the way they always were.

## 2026-08-03 : Every select and checkbox on the apply form is controlled

- Decision: `useState` for the city, gender, both recommender genders, the terms
  checkbox, and the SMS checkbox, rather than `defaultValue`/uncontrolled.
- Why: A failed submit re-renders the form through `useActionState`. Text inputs
  keep their DOM values; uncontrolled selects are re-applied from `defaultValue`
  and uncontrolled checkboxes come back unchecked. The terms box and the city
  were silently resetting on every validation error before this change, so an
  applicant fixed the one field the error named, submitted again, and got a
  fresh error for a field they had already filled in.

## 2026-08-03 : `allowedDevOrigins` includes 127.0.0.1

- Decision: Set `allowedDevOrigins: ["127.0.0.1", "localhost"]` in
  `next.config.mjs`. Development only; production builds ignore it.
- Why: Next 16 blocks cross-origin requests for dev resources and treats
  127.0.0.1 as a different origin from localhost. The sandbox server and every
  browser test address the app by IP, so the client bundle was refused and the
  page rendered but never hydrated. Server actions still worked, because a form
  posting to an action degrades gracefully without JavaScript, so nothing looked
  broken until the first control that genuinely needs JavaScript (the photo
  uploader) did nothing when clicked.

## 2026-07-28 : Members describe themselves; the matchmaker only pairs
- Decision: The introduction invitation carries the other person's whole profile
  as that person wrote it. The operator writes no description of any member.
- Decision: Keep exactly one operator-authored line, `Match.rationale`, and
  scope it to the pairing rather than to either person. Both people see it.
- Decision: Email is the channel that carries an introduction, because only it
  can hold a profile. SMS is a nudge to the same token-gated page, sent only
  with separate text consent, and is never the introduction itself.
- Decision: Build the invitation from the member's profile at send time rather
  than from a copy stored on the Match, so a resend reflects the current profile.
- Why: Two people deciding whether to meet should be reading each other, not a
  third party's summary of each other. The old "About X" bullets were an
  operator-voiced paraphrase invented for an SMS-first flow, they went stale the
  moment a member edited their profile, and they put the matchmaker in the
  position of characterizing members to each other.
- Alternatives rejected: keeping the bullets as an optional supplement (the same
  staleness and the same voice problem, just less often); dropping
  `aboutPersonA`/`aboutPersonB` from the schema now (kept as dead columns so
  existing rows survive; remove in a planned migration).

## 2026-07-23 : Role-based studio administration
- Decision: Keep one email magic-link authentication flow and separate
  authorization into member, operator, and super-admin roles.
- Decision: Give `jesswolflord@gmail.com` the initial super-admin role. Super
  admins can provision and revoke ordinary operators. Ordinary operators retain
  all matchmaking capabilities but cannot change studio access.
- Decision: Invalidate sessions and outstanding magic links whenever privileges
  increase, and invalidate sessions when operator access is revoked.
- Why: Mutuals needs individual identities and least-privilege studio access,
  not shared credentials or organization tenancy.
- Alternatives rejected: shared operator passwords, allowing every operator to
  manage access, and introducing organization-level multi-tenancy without a
  current product requirement.
- Reversible?: Additional organizations or delegated admin roles can be added
  later without changing the current sign-in mechanism.

## 2026-07-23 : Launch integrity architecture
- Decision: Store photos in Vercel Blob when configured and otherwise in
  Postgres. Never use a machine-local production fallback.
- Decision: Deliver introductions through a database outbox with fenced claims,
  authorization checks at send time, provider identifiers, bounded retries, and
  visible failure state.
- Decision: Never disclose one member's phone number to another through the
  connection flow. Share only currently authorized contact data.
- Decision: Represent venue booking and calendar coordination as manual until a
  real integration exists. Remove dormant booking tools and public demos that
  claim otherwise.
- Why: Mutuals runs on two Fly machines and handles sensitive dating data.
  Media, consent, and delivery must remain consistent through restarts, retries,
  deploys, blocks, opt-outs, and account deletion.
- Alternatives rejected: local volume storage, direct provider calls inside
  state transitions, blind retry of ambiguous SMS outcomes, phone disclosure
  based only on service-message consent, and simulated booking confirmation.
- Reversible?: The provider integrations can evolve behind the same storage and
  outbox boundaries. Privacy and authorization checks are intentional invariants.

## 2026-06-29 : "Nightcap" visual identity (dark, candlelit)
- Decision: Replace the cream + Fraunces-serif look with a dark, editorial supper-club identity. Near-black plum canvas, candlelight off-white text, one ember-amber accent (gold-foil CTAs) + garnet rose romantic accent. Bodoni Moda display serif, JetBrains Mono "concierge stamp" eyebrow labels, candlelit body vignette + warm hero glow.
- Why: Joshua flagged the cream/serif palette as reading like generic "AI/Claude" aesthetic. Dark is the clearest signal it is NOT Claude, and a candlelit-bar mood fits where intros actually happen. Joshua picked this direction over a bold-light editorial and a charcoal/blush option.
- How: re-themed the design SYSTEM (tailwind tokens keep their NAMES but flip dark; globals component classes; fonts) so the whole token-based app re-skins; literal bg-white -> bg-panel app-wide; spot-fixed Hero, Logo, scrims.
- Verified: typecheck + build clean; browse-daemon QA on desktop (1280) + mobile (390) across landing, apply, studio Conversations console, member profile. Zero console errors, zero horizontal page overflow, tables h-scroll within their container. Deployed to prod (Fly v67), dark theme confirmed live.
- Alternatives rejected: Atelier Noir (bold light), Ink & Rose (charcoal/blush). Reversible (branch redesign-nightcap; pure styling, no logic change).

## 2026-06-28 : Five-feature launch (bot SMS + operator console + vouch + connections + Sentry)
- Decision: Implement all five features from Erik's call notes as an integrated v1.1 release.
- Why: Operator visibility (console) and bot capability (SMS intro + group thread) are the core value prop; vouch system builds trust; member visibility scoping prevents roster-browsing; Sentry enables production observability.
- Approach taken:
  - Bot composer: LLM-optional with deterministic fallback template. NVIDIA/Claude/OpenAI with 18s timeout; falls back to strong template if LLM unavailable or times out. Graceful degradation ensures intros always send.
  - IntroMessage model: Single append-only log per match. Captures invites, Y/N decisions, bot openers, group messages, operator jumps. Health scoring is a pure function over match + message timestamps.
  - Conversations webhook: Reads-only (no auto-reply). Logs inbound group messages; operator can jump in anytime via form. Logs to transcript before returning to Twilio.
  - Member visibility: Scoped to profile + connections only. connectionsOf() derives from referrals + dinner co-attendance + vouches. connectedPersonIds() filters to mutual_yes/connected match stages only, excluding blocks.
  - Sentry: Wired into SMS/Conversations webhooks as best-effort error capture. No-op until SENTRY_DSN is set; never blocks webhook returns.
- Alternatives considered / rejected:
  - Auto-reply bot in group threads: rejected in favor of read-only + operator jump-in (user intent: "I step back").
  - Directory browse feed: rejected per spec ("no in-app browse/swipe feed"); only connections view surfaces other members.
  - Vouching via in-app votes: deferred to V2 (out of scope for call notes); current system is operator-curated vouch display.
- Reversible?: Yes. All schema changes are additive; features are feature-flagged via env vars (SENTRY_DSN, LLM provider choice).

## 2026-06-28 : Community-driven admissions deferred to V2
- Decision: Do NOT build the admissions committee / swipe-to-admit flow now.
- Why: Erik flagged it as a longer-term idea ("we can build this later"). V1
  keeps centralized approval (operators approve applicants in the studio roster).
- Reversible?: Yes - the Vouch graph + applicant review already provide the data
  a committee flow would build on.

## 2026-06-24 : Context system created
- Decision: Adopt durable markdown context (CLAUDE.md + docs/) for this project.
- Why: Explicit, version-able context loads deterministically every session and is more reliable than chat/agent memory.

<!--
## YYYY-MM-DD : <decision title>
- Decision:
- Why:
- Alternatives considered / rejected:
- Reversible?:
-->
