# meet-cute : Status

_Single source of truth for current state. Update at the end of every work session._

Last updated: 2026-06-30 (hero + mobile shipped live)

## Design (2026-06-30, LIVE in production)
- Full-bleed cinematic hero: edge-to-edge intro video, transparent overlay nav (SiteHeader `overlay` prop), dual scrim + film grain, three reduced-motion-safe motions (Ken Burns, scroll parallax/fade, staggered reveal). PR #8.
- Mobile: hero serves optimized poster via next/image (AVIF/WebP) instead of the 8.4MB video (video is display:none < md, never fetched on cellular); desktop keeps the video. No horizontal overflow at 390px; sections stack.
- Earlier polish (PR #7): Sign in kept in the mobile header; testimonial marquee edge fades widened.
- Operator console polish (PR #6): hours-level latency, bulk resend/close, feedback surfacing.
- DEPLOYED 2026-06-30 to Fly (machine d8d0504f10e6e8, image deployment-01KWDMFN, started). Verified live: hellomeetcute.com + meet-cute.fly.dev return 200 and serve the new hero markers (100svh, film-grain, hero-kenburns, overlay header). Deploy note: an earlier interrupted attempt left a stale machine lease that failed the first two `fly deploy` runs; clearing the stray flyctl process let the rollout settle. Production is now caught up with master.

## Now (current state)
- Five core features from Erik's call notes completed and integrated:
  1. Bot text introductions with Y/N SMS opt-in and 3-way group MMS (Twilio Conversations)
  2. Operator console for bot conversation visibility, opt-in state, health scoring, jump-in
  3. Vouch/recommendation system for community trust (already in apply form + profile display)
  4. Member visibility scoping (connections-only view via /app/connections)
  5. Sentry error monitoring wired into SMS + Conversations webhooks
- All features type-checked and build-verified.
- Dev server: http://localhost:3009 · demo login at `/studio/login` and `/login`.
- Live demo scenario: **Maya Rosen ↔ Alex Chen** match (suggested, both undecided). One command: `npm run demo:setup`.

## Done (Erik's call notes)
- Prisma schema: added voucherName, voucherContact, recommendation to Person; conversationSid to Match; created IntroMessage model.
- Bot composer (/lib/intro-bot.ts): LLM-based group intro with deterministic fallback, emoji-free graceful degradation.
- Conversations webhook (/api/sms/conversations): logs all group thread messages to IntroMessage transcript.
- SMS inbound webhook enhanced with Sentry error handling.
- Operator console (/studio/conversations): list view with health badges, opt-in state, last activity; detail view with full transcript + jump-in form.
- Member connections view (/app/connections): list of mutually connected people; detail view guarded by isConnectedTo().
- Sentry.captureException() integrated into error paths; no-op until SENTRY_DSN env var is set.
- Bot opener stores conversationSid on the match; invites + Y/N replies + group messages all log to IntroMessage so the console shows the full thread.
- Member surface scoped: nav is Home / Connections / Profile / Settings; old swipe feed + events + invite redirect to /app.
- Watchdog now pulls unresolved Sentry issues into its status/alerts. Sentry + Seer (AI autofix PRs) setup documented in docs/OBSERVABILITY.md.
- Recommendation fields merged into the redesigned (atelier-v2) ApplyForm with inline validation.

## Done (earlier)
- Demo setup script: `npm run demo:setup` (resets Maya/Alex fixture + prints sign-in links).
- Operator login page at `/studio/login`; demo video pipeline (`scripts/make-demo-video.ts`).
- QA pass on signup + operator dashboard: isTextablePhone validation, inline apply-form errors via useActionState, appliedAt stamping, accept-rate metric fix, composer bio prefill, dev sign-in link logging on send failure.

## In progress
- A2P 10DLC completion (auto-driven by ~/.gstack/a2p advancer, launchd com.meetcute.a2p, now 10-min cadence). As of 2026-06-29 ~17:24 UTC: Customer Profile = twilio-approved; A2P Trust Product = in-review (resubmitted); Brand + Campaign + number-attach still pending. Texting will not deliver (error 30034) until the campaign approves and +16465860039 is attached to MG9fd14c01c6e72fea4e39d4d6c48cc50e. App code + webhooks are deployed and healthy; only carrier registration is the gate.
- Sentry + Seer: DONE. Capture live (DSN wired via fly.toml build args + runtime secrets), Seer scanner + autofix=high + code mappings set for BOTH meet-cute and riiva projects (org=riiva). User token at ~/.gstack/credentials/sentry-user-token.txt.

## Verified live 2026-06-30
- App live + healthy: meet-cute.fly.dev AND hellomeetcute.com both return 200; one machine in sjc, deployed 2026-06-29.
- Sentry prod env: DONE. All five secrets present in Fly (SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN, SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN).
- Magic-link email: VERIFIED end to end. Submitted /login on hellomeetcute.com; Resend logged "Your Meet Cute sign-in link" from `Meet Cute <hello@hellomeetcute.com>` -> delivered. RESEND_FROM confirmed = hello@hellomeetcute.com (verified domain).
- Conversations webhook: ALREADY WIRED + live. Account-level Conversations config: onMessageAdded -> POST https://hellomeetcute.com/api/sms/conversations. Endpoint live: GET->405 (POST-only), unsigned POST->403 (signature-guarded). Done.
- A2P 10DLC (live Twilio check): Customer Profile = twilio-approved. A2P Trust Product = in-review (last updated 2026-06-29T17:06Z, ~25h no movement). Brand registrations = 0 (cannot create until TP approves). Advancer (launchd com.meetcute.a2p, 10-min cadence) running normally; will auto-advance Brand -> Campaign -> number-attach once Twilio clears.

## Next (prioritized)
1. BLOCKER (external, waiting on Twilio only): A2P 10DLC Trust Product review. SMS returns error 30034 until TP approves, then Brand + Campaign register and +16465860039 attaches to MG9fd14c01c6e72fea4e39d4d6c48cc50e. Advancer auto-driving; escalate to Twilio support if still in-review past ~2026-07-02.
2. Backlog polish (non-blocking): health-score latency metric, operator bulk actions (close expired / resend stalled intros), post-connection member feedback, community admissions voting (V2).

## Blockers
- (none)

## Open questions
- Should health scoring include metrics like message latency (hours since last activity)?
- Recommend running Twilio webhooks through ngrok in dev, or use a test Conversations Service?
