# mutuals : Decision Log

_Append-only. Newest at top. Each entry: what was decided, why, and what was rejected._

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
