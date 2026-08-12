# mutuals : Decision Log

_Append-only. Newest at top. Each entry: what was decided, why, and what was rejected._

## 2026-08-11 : The studio was slow because of where the database is

The operator studio was slow on every page. It is not the amount of data: on
this date production held 98 people, 29 of them active, and one match. It is
that Fly runs the app in `sjc`, Neon holds every row in `us-east-2`, and a warm
round trip between them is about 50ms. Pages that ask a database twenty separate
questions and wait for each answer are slow no matter how little it holds.

- **Round trips are the unit, not milliseconds.** A laptop's database answers in
  under a millisecond, so nothing measured locally transfers. Statements counted
  around one request do. `PRISMA_LOG_QUERIES=1` exists for that and for nothing
  else. Ten studio pages cost 114 round trips before and 45 after.
- **Authorization reads what authorization decides on.** It was reading the
  session, then the person, then that person's photos, then their prompts, and
  the layout and the page each did it, so eight round trips ran before a page
  read anything it was asked for. It is one query now, joined and cached per
  request. Photos and prompts decide nothing about whether somebody is an
  operator.
- **A page render never calls a third party.** Opening a profile called the
  embeddings API behind a 12-second timeout whenever the person had no stored
  vector, and no active member had one, so it happened every time. The stored
  vector is used when it exists and a deterministic local one stands in when it
  does not. `npm run embed` is where that call belongs.
- **Rejected: caching the pages.** Every number in the studio is something an
  operator is about to act on, and a stale roster is worse than a slow one. The
  fix was to stop asking the same question repeatedly, not to stop asking.
- **Rejected: moving the database.** A Neon project cannot change region, and
  moving the app is a config change with no data risk. `fly.toml` now says
  `iad`; the live machines still have to be moved by hand, and that is the
  largest remaining win.

Full accounting, including the query shapes that were reading whole tables to
count them, in `docs/PERFORMANCE.md`.

## 2026-08-06 : Any two friends, and a way to put somebody forward

Both from Jess, off what people were actually replying with.

- **The gate is any two friends.** It was two friends of the opposite gender,
  and the form asked for them by name: "two single men", or two single women.
  People were stopping on the last screen of the application saying they did not
  have two single friends of the right description to name. An applicant who
  cannot name anybody does not become a better member, they become no member at
  all, so both qualifiers are gone: `countsTowardGate` is deleted, the form
  rejects nothing on gender, and the copy is "Name any two friends who know you
  well."
- **Gender is still asked for each friend and still stored.** It says who the
  warmest leads in this network are, which is worth knowing. It decides nothing,
  and `Recommendation.gender` is nullable now because a nomination never asks.
- **Rejected: changing the copy alone.** "Any two friends" on a form whose gate
  still counted only the opposite gender would have been worse than the old
  rule: the applicant names two people, both write, and nothing opens, with
  nobody able to say why.
- **`/refer` puts somebody forward who has not applied.** Everything else in
  this product starts with an applicant naming friends; the thing people say
  first, unprompted, is "you should meet my friend". It needs no account, for
  the same reason vouching needs none.
- **A nomination with real words (40 characters, the same floor the
  recommendation form uses) becomes an answered recommendation when the nominee
  applies**, so they are asked for one friend instead of two. It is not a
  discount: somebody who knows them wrote about them before being asked, which
  is exactly what the gate is for. Two nominations with words accept somebody
  outright on submit.
- **One email to the nominee, ever.** Their address came from a third party.
  There is no nudge schedule behind it, unlike every other ask in this system.
- **The receipt to the nominator never says whether the person is already a
  member**, and an existing member is recorded and not emailed. Whether somebody
  is in Mutuals is theirs to tell.

## 2026-08-04 : Single, said out loud. And a friend can finally say no

- The ask is now "Name two single men who know you well", or two single women,
  by the applicant's own gender. The people who vouch are the warmest leads
  Mutuals ever sees: they know a member personally, they are in the right city,
  and they have just spent two minutes thinking about somebody's dating life.
  That only becomes members if the person named is available to be one, and
  "two men" was collecting married brothers and colleagues.
- It is guidance, not a check. Nothing verifies it and nothing should: a
  recommendation from someone who knows you well still counts, and refusing one
  because we doubted their marital status would be absurd.
- The friends page rendered its own chrome: a two-circle "1 you, 2 friends"
  rail, no progress bar, a centred back link. It was the same application in
  different clothes at the exact moment somebody decides whether to finish. It
  goes through StepShell now like the other six.
- Which makes it Step 7 of 7, and that is the honest count. Showing "6 of 6" and
  then producing another page is precisely the hidden cost the stepper exists to
  remove.
- A friend can decline. `declined` existed in the schema from the first day and
  nothing ever wrote it, so somebody who did not want to vouch was
  indistinguishable from somebody who forgot, and got chased at 48 hours, 5 days
  and 10 days for it. Three emails to a person who has already decided is how an
  address stops opening any of them.
- Declining counts toward nothing, cancels that friend's reminders, and is
  final: a tap or a reply arriving afterwards cannot revive it, because being
  counted anyway means never having been given a choice.
- The applicant is never told who declined. They see the number they still need,
  which is what they can act on. Naming the friend who said no is the one thing
  that would make asking for two friends cost a friendship.
- The control is quiet and last, so it is never the easy option, and it is not
  shown to someone who has already vouched.

## 2026-08-04 : Browser checks wait on the outcome, never on the screen

- Master went red three times in one day, in three different files, every one a
  wait on a UI transition that had not landed while the row underneath was
  already correct. One printed the studio page it was giving up on and it was
  rendering perfectly well. The same SHA passed on a rerun, which is what makes
  this expensive: a green run and a flaky run are indistinguishable until the
  next one fails.
- Cause: every application step and every studio action is a server action plus
  a redirect, so the control a check wants appears strictly after the commit.
  Waiting only on the control makes a slow round trip indistinguishable from a
  missing control, and 20 seconds is not much on a loaded runner.
- Decision: `scripts/journey-waits.ts` is the one way to do this. Assert the
  commit against the row, then give the screen 60 seconds it will not need. A
  real regression still fails, and it fails saying which step never committed
  rather than which button never appeared, and it prints the row.
- Two files were fixed piecemeal earlier the same day and both are folded onto
  the shared helper, because three private versions of this is how the fourth
  site got missed.
- There are now no 20-second element waits and no `waitForURL` in the journey
  checks. Verified by running the three worst offenders three times each.

## 2026-08-04 : A tap is a real answer, and three emails said it was prose

- Found by reading the delivered mail rather than the send log. The full
  acceptance path was rehearsed on production with one friend writing and one
  tapping, and the tapper was thanked with "your words are on their profile".
  She had written none. The applicant was separately told she "just wrote your
  recommendation", and the delayed follow-up said the same thing again.
- Cause: `endorsed` and `submitted` both satisfy the gate, and all three
  templates took one boolean, `accepted`, so nothing downstream could tell a tap
  from a paragraph. The one-tap vouch was added deliberately, because most
  people answer from a phone, and every email about it was written as though
  they had not.
- Decision: all three take `wroteWords`. Four outcomes, not two: whether that
  answer was the one that got somebody in varies independently of whether there
  is anything to read.
- Decision: the thanks to a tapper now asks for the words and links back to
  their own ask. This is the growth part, not the tidiness part. The thanks
  email is the one moment a tapper is paying attention, and telling them the job
  was done removed the only reason to write anything. Words are what the profile
  renders and what introductions are drafted from.
- Every variant is a case in scripts/test-lifecycle-emails.ts, asserting that a
  tap is never described as writing.

## 2026-08-04 : The application is measured, not argued about

- `scripts/apply-funnel.ts` reads the live roster: who signed in, who answered
  anything, who finished, where the unfinished ones stopped, whether the
  confirmation and the asks were sent, and who accepted whom.
- It buckets on when a person first signed in, because the stepper shipped
  mid-morning and both forms ran the same day against the same traffic.
- The reason it exists: reverting the six-step form was raised on impressions,
  and 5 hours after it shipped exactly one person had seen it. There was nothing
  to revert on in either direction. The tool is so that question has an answer
  next time it is asked.
- It also corrected a metric that was lying. Attribution reads acceptedById,
  which is null on every row that predates the gate, so "no override recorded"
  was being counted as "accepted by their friends" and crediting the gate with
  13 hand approvals that happened before it existed.

## 2026-08-04 : A surname is required, and the one-page form is audited into the stepper

- Decision: last name is required. It is still never shown before two people
  have both said yes, and the step copy now says that instead of calling the
  surname optional.
- A name is one column, so requiring the second half made the split the
  dangerous part. It ran on every redraw and dropped the last word of any
  three-part name: "Mary Anne Smith" came back as "Mary Anne". splitName takes
  everything after the first space, and the round trip is asserted lossless.
- isStepDone("name") now wants both parts, because a row seeded at sign-in
  carries the email local part as a one-word name. That looked like an answered
  step, which is how somebody could reach the friends page having never typed
  their own name. On the live roster this is 21 people, all of whom had
  applicationStep null and were being asked anyway, so nobody is newly stopped.
- Anyone already past the first half keeps their one-word name. Requiring a
  surname today is not a reason to stop someone who answered that screen
  yesterday. Three members are in that position: Nicole, Kim, Michael.
- A rejected step now hands back what was typed, in the query string. It cannot
  go on the row: half a name is not a name, and the seeded local part has to
  stay distinguishable from something a person actually wrote. Without this,
  being asked for a surname also wiped the first name, which is the part people
  actually leave over.
- Audited every field on the pre-stepper one-page form against the six steps.
  All thirteen inputs survived the split. Two pieces of copy had not:
  - The email the application belongs to was shown nowhere once signed in, so
    somebody who signed in on a work laptop had no way to notice they were
    applying as their work address until the first introduction arrived there.
    It is back on the last step, read-only.
  - "Prefer not to? Leave this unchecked. You will still be introduced to your
    matches by email." That line is what makes the SMS box read as genuinely
    optional, which is the thing CTIA and A2P 10DLC care about.
- The 18-plus line and the reason gender is asked were not lost. They moved into
  the step subtitles, which is why the audit was worth doing field by field
  rather than by reading the diff.

## 2026-08-04 : One rehearsal runs against the deployed build, not the tree

- Context: the launch suite walks the six application steps and refuses to run
  against anything but an isolated local database. That guard is right, and it
  also means nothing has ever exercised what is actually serving traffic. A
  green CI run proves the tree was good when it was tested. It does not prove
  the container serves the flow, that the Resend key in it is live, that Vercel
  Blob took the photo, or that the two asks left the building.
- Decision: `scripts/prod-application-walk.ts --yes` signs up, answers all six
  questions, uploads a face, names two friends, opens one ask and vouches, on
  the live site against the live database, then deletes every row it made.
- Decision: it only touches addresses it generates under one prefix, and the
  cleanup asserts that prefix before deleting anything. A destructive script
  pointed at the live roster gets one filter it cannot be talked out of.
- Decision: it emails nobody but Josh. Applicant and both recommenders are
  plus-addresses on his own mailbox.
- Decision: the seeded row is stood up the way a real sign-in stands one up,
  name from the email local part and city defaulting to NYC. Seeding the answers
  would make the commit-per-step assertions pass against a row that was already
  correct, which is exactly the mistake that once landed people on step three.
- Decision: it waits for both asks to reach `sent` with a provider id rather
  than trusting `requestedAt`. That column says the code ran. Only the outbox
  says a provider accepted the mail.
- The first run leaked, and the fix came from that: eighteen delivery jobs
  survived cleanup because an ask is addressed to a friend who has no row here
  and cleanup deleted by personId. Ten were reminders scheduled to fire two days
  later. Cleanup now deletes the outbox by recipient too. A rehearsal that
  leaves future sends behind is not a rehearsal.

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
  vouch back. (The opposite-gender rule applied to the credit until 2026-08-06;
  any live member earns it now.) Vouching
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

## An applicant mid-application when we ship (4 August 2026)

A Next.js server action is addressed by an id minted at build time. Mutuals
ships several times a day, so a page somebody loaded twenty minutes ago posts an
id the running build has never heard of. Next refuses it (404,
`x-nextjs-action-not-found`), the client router throws, and the throw lands on
the error boundary.

The boundary offered `reset()`, which re-renders the bundle the browser is
already holding, which sends the same dead id, which fails identically. "Try
again" was a closed loop. An applicant hit it on 4 August, pressed it several
times, and stopped applying. Six deploys went out that day.

The recovery is a fresh document, and it is the only one available. Skew
protection that serves the old build back to an old page is infrastructure
Vercel provides and Fly does not; Next's `experimental.useSkewCookie` sets a
`__vdpl` cookie for that infrastructure to read and switches off the asset
stamping we do get, so it is worse than nothing here.

So: one silent automatic attempt on mount, then a button that does the same
thing deliberately, both in `src/components/Recovery.tsx`. A reload is lossless
because the application already saves each answer as it is given, so `/apply`
redraws the furthest step reached. `deploymentId` is set from the commit SHA so
each build's assets get their own cache entries and a skew is visible rather
than a mystery.

Left open, knowingly: a submit made before the page hydrates posts natively, and
that throw happens inside Next's action handler before any render, so no React
boundary sees it and the response is a bare "Internal Server Error". A
`global-error.tsx` does not catch it either; that was measured, not assumed.
Reaching it needs a deploy to land in the seconds between the page's HTML being
rendered and the submit, rather than the hours-wide window the hydrated path
has, which is why the production logs show none of them. Closing it would mean a
build-stamp cookie check in front of every request.

`npm run test:journey:skew` pins the behaviour.

## Server action ids are pinned to a fixed key (4 August 2026)

The boundary fix above makes a stale submit recoverable. This makes it rare.

A Next.js server action is addressed by an id derived at build time from the
action's module and export, salted with an encryption key. Left to itself Next
generates that key randomly for every build, and the salt dominates: two builds
of byte-identical source produced two completely disjoint sets of ids, 58 of 58
changed. That is the real reason an applicant got stranded. It was never that we
edited the action she was calling. Any deploy at all invalidated every page
anyone was holding, and we ship several times a day.

With `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` pinned, the ids become a function of
the code alone. Measured across two clean builds, across an unrelated file
changing, and across `src/lib/actions.ts` itself changing: identical every time.
An id minted by the previous build now resolves and runs against the next one,
verified end to end by posting a captured id from one build to a server running
the next.

Build time only. Next writes the key it used into
`.next/server/server-reference-manifest.json` and the running server reads it
from there, so there is no runtime environment variable and no Fly secret to
keep in sync. It is a real secret (it encrypts bound arguments that cross to the
client), so it travels as a BuildKit secret, never a build arg.

The deploy fails closed without it. A build with a random key succeeds, passes
every check, looks perfect, and quietly breaks every page that is already open,
which is precisely the failure nobody catches until somebody writes in. Rotating
the key has the same effect once, so rotate deliberately.

`npm run test:launch:actionids` pins the plumbing and checks the key actually
reached Next rather than being dropped on the way.

## Photos are written twice (4 August 2026)

`writeUpload` used to choose a backend and return bytes for exactly one of them,
so in production Postgres held the only copy of every member photo. The schema
calls `PhotoAsset` a "fallback", which it could never be while nothing else had
the bytes. 125 photos, 24 MB, one copy, with the form about to go out again.

Postgres serves: same region as the app, shared by every instance, already
proven, and an ordinary photo view never leaves the datacentre. A private Tigris
bucket on the same host takes the second copy, written on every upload and
allowed to fail, because a bucket having a bad day must never be why an
applicant cannot finish. A failed mirror logs and raises to Sentry, and
`npm run photos:backfill` sweeps up anything that only reached Postgres.

Reads fall back to the bucket, so a row whose bytes went missing is recoverable
rather than a 404.

Vercel Blob was the other branch and is gone. That account is past its usage
threshold and its one store is suspended, so it could not have held a copy of
anything. Removing it also dropped the vulnerable `undici` it pulled in.

Credentials are bucket-scoped and `fly storage create` prints them once, so they
live in `~/.gstack/credentials/meetcute-tigris-photos.txt` as well as in the Fly
secrets. Recreating the bucket does not re-set the app secrets; it says so and
leaves the old ones in place, which is worth knowing because the app then points
at a bucket that no longer exists and the mirror silently fails.
