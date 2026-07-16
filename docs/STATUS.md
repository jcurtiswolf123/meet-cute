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

## Checked live 2026-07-08 (~21:30 UTC)
- A2P 10DLC: Customer Profile = twilio-approved (unchanged). A2P Trust Product BU26c444d0a43a6c5044db6aa9692445db = STILL in-review, zero movement since submission 2026-06-29T17:06Z (9 calendar days). Latest evaluation = compliant on both checks (Primary CP Bundle Proof passed, US A2P General Business Info passed); entity assignments correct. Nothing fixable on our side.
- Brands = 0, Campaigns on MG9fd14c01c6e72fea4e39d4d6c48cc50e = 0 (both gated behind TP approval). SMS still returns error 30034.
- Advancer healthy: launchd com.meetcute.a2p polling every 10 min, logging "halt: trust product status=in-review" continuously through today. Will auto-run Brand -> Campaign -> number-attach the moment Twilio approves.
- ESCALATION DUE: the 2026-07-02 escalate-by date has passed. Filing a Twilio support ticket requires console/Help Center login (help.twilio.com), which needs Joshua's Twilio login + MFA (browse daemon has no Twilio session). Ticket ask: "A2P Messaging Trust Product BU26c444d0a43a6c5044db6aa9692445db has been in-review since 2026-06-29 with a compliant evaluation and an approved Primary Customer Profile (BUa9f097eb7a501dde7a3b8dfefffd3304); please review/approve."

## Checked live 2026-07-16 (~16:40 UTC) + Telnyx migration built
- A2P 10DLC: TP `BU26c444d0...` STILL in-review, zero movement since 2026-06-29T17:06Z (**17 days**). Brands=0, Campaigns=0, sends still error 30034. Advancer healthy (10-min cadence, logging "halt: trust product status=in-review"). Normal Twilio secondary review is a few business days; this is a stalled queue, support-escalation warranted.
- Decision (Joshua 2026-07-16): escalate the Twilio ticket AND switch to Telnyx in parallel.
- BUILT (branch `telnyx-migration`, commit 612b3c2): dual-provider SMS selectable via `SMS_PROVIDER` env (twilio default | telnyx). Twilio path unchanged. Telnyx: `sendViaTelnyx` (POST api.telnyx.com/v2/messages, Bearer), `verifyTelnyxSignature` (Ed25519 over `timestamp|rawBody` + 5-min replay window, SPKI-wraps raw portal key), inbound webhook parses Telnyx JSON + Ed25519 and replies out-of-band via API. Group MMS (Twilio Conversations masking) has NO Telnyx analog: guarded Twilio-only, declines under telnyx so callers fall back to brokering numbers (connectedSMS). Verified: tsc clean, next build passes, Ed25519 verify unit-tested (valid passes / tampered rejected). New env: SMS_PROVIDER, TELNYX_API_KEY, TELNYX_FROM, TELNYX_MESSAGING_PROFILE_ID, TELNYX_PUBLIC_KEY (in .env.example).
- TWO HUMAN GATES REMAIN (both blocked on Joshua, code is ready):
  1. ESCALATE: log into help.twilio.com (console login + MFA; browse daemon has no Twilio session) and file the ticket. Ask: "A2P Messaging Trust Product BU26c444d0a43a6c5044db6aa9692445db has been in-review since 2026-06-29 with a compliant evaluation and an approved Primary Customer Profile BUa9f097eb7a501dde7a3b8dfefffd3304; please review/approve."
  2. TELNYX: create a Telnyx account (email verify + payment method), buy a 10DLC number, submit Brand + Campaign under Vanguard Labs LLC (EIN 99-2503371, HEALTHCARE, shiftsupportnetwork.com). Telnyx internal brand/CP vetting turns in days not weeks. Then set the 5 TELNYX_* + SMS_PROVIDER=telnyx secrets in Fly and point the messaging-profile inbound webhook at hellomeetcute.com/api/sms/inbound. Once a number is live, `git checkout master && git merge telnyx-migration && fly deploy`.

## Telnyx account CREATED 2026-07-16 (~17:20 UTC) — gate 2 partially done
- Created via Telnyx's SANCTIONED agent-signup flow (POST /v2/bot_challenge -> solve -> /v2/bot_signup -> magic link read via josh@shiftsupportnetwork.com IMAP -> /v2/api_keys). The normal https://telnyx.com/sign-up page bot-blocks headless browsers ("your browser could not be authenticated"); the agent flow at https://telnyx.com/agent-signup.md is the intended path.
- Account: josh@shiftsupportnetwork.com, org/user 8d1c9c83-478f-4a8f-9997-50bcce609033. Balance $0.00.
- DONE (free): API key KEY019F6BF11A6414AFB8CC6333BDB0FD9C (verified live); messaging profile "Meet Cute" 40019f6b-f1c4-4a12-8b1d-4eacea980794 (inbound webhook -> hellomeetcute.com/api/sms/inbound, v2); webhook Ed25519 public key n9QkllAdcWNLa3g60KGa8xCvh7MpMx1OU5OKg+y01Kw= (32 bytes, validated against verifyTelnyxSignature). All secrets in ~/.gstack/credentials/telnyx-login.txt (chmod 600). Env values map: TELNYX_API_KEY=<key>, TELNYX_MESSAGING_PROFILE_ID=40019f6b-..., TELNYX_PUBLIC_KEY=n9Qk..., TELNYX_FROM=<the number, once bought>.
- PROGRESS 2026-07-16 ~18:00 UTC: Joshua funded balance to $5.00 + account shows "Your Telnyx Account Has Been Upgraded". Number BOUGHT via API: **+13854860015** (active, assigned to Meet Cute messaging profile 40019f6b-...). Balance now $3.43. TELNYX_FROM=+13854860015 stored.
- BLOCKED — ACCOUNT-LEVEL / VERIFICATION WALL: 10DLC endpoints (GET/POST https://api.telnyx.com/10dlc/brand and /10dlc/campaign) return error 10038 "Feature not permitted at this account level. Refer to https://telnyx.com/upgrade." Number purchase works but A2P 10DLC Brand+Campaign registration is gated behind a higher account level (business verification / KYC). This is the Level-2 wall. UNBLOCK = Joshua completes the account upgrade + business verification in the portal (telnyx.com/upgrade or Portal > account/verification), and add more funds (~$25 to cover Brand ~$4 one-time + Campaign ~$10/mo vetting; $5 is too thin). Then I finish via API: POST /10dlc/brand (Vanguard Labs LLC, EIN 99-2503371) -> POST /10dlc/campaign (use case) -> assign number to campaign -> set 5 Fly secrets + SMS_PROVIDER=telnyx -> merge telnyx-migration -> fly deploy -> live test send.
- Everything up to the 10DLC wall is API-driven and done. All IDs/secrets in ~/.gstack/credentials/telnyx-login.txt + memory reference_telnyx_account.

## TWILIO UNBLOCKED 2026-07-16 ~18:47 UTC (escalation worked) — now the faster path
- Twilio support (ticket #27999003) replied 18:39: Trust bundle BU26c444d0a43a6c5044db6aa9692445db APPROVED. The advancer (com.meetcute.a2p) then auto-ran: Brand BNa5fe1d0dbab802fed3e5de9f1d159d21 = **APPROVED / VETTED_VERIFIED**, and submitted campaign (us_app_to_person QE2c6890da8086d771620e9b13fadeba0b, LOW_VOLUME) on Messaging Service MG9fd14c01c6e72fea4e39d4d6c48cc50e.
- Campaign REJECTED (status FAILED) on two URL-content errors, both FIXABLE:
  - 30908 PRIVACY_POLICY_URL: privacy policy missing the mandatory "mobile info / SMS consent not shared with third parties for marketing" statement.
  - 30882 TERMS_AND_CONDITIONS_URL: terms page had no SMS program terms.
- FIX SHIPPED (commit af1bd04, merged to master, deploying to Fly now): added compliant SMS sections to /privacy (section 6) and /terms (section 5) on hellomeetcute.com. tsc + build clean.
- RESUBMIT PENDING (auto, once deploy verified live): DELETE us_app_to_person QE2c6890... then re-POST it (advancer content is already compliant: honest LOW_VOLUME opt-in description, Y/N samples, STOP/HELP). Twilio re-scrapes the URLs on resubmit, so must confirm live pages show new language first. Then +16465860039 attaches to MG9fd14c... and error 30034 clears.
- STRATEGIC: Twilio is now ~1 resubmit from live; Telnyx (number bought, blocked on KYC) becomes the backup. Same privacy/terms language now also satisfies Telnyx 10DLC when/if used.

## Next (prioritized)
1. BLOCKER (external, waiting on Twilio only): A2P 10DLC Trust Product review. SMS returns error 30034 until TP approves, then Brand + Campaign register and +16465860039 attaches to MG9fd14c01c6e72fea4e39d4d6c48cc50e. Advancer auto-driving. ESCALATE NOW (past the 2026-07-02 threshold): Joshua logs into help.twilio.com and files the ticket per the 2026-07-08 note above.
2. Backlog polish (non-blocking): health-score latency metric, operator bulk actions (close expired / resend stalled intros), post-connection member feedback, community admissions voting (V2).

## Blockers
- (none)

## Open questions
- Should health scoring include metrics like message latency (hours since last activity)?
- Recommend running Twilio webhooks through ngrok in dev, or use a test Conversations Service?
