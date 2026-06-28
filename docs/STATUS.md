# meet-cute : Status

_Single source of truth for current state. Update at the end of every work session._

Last updated: 2026-06-28

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
- (none)

## Next (prioritized)
1. BLOCKER: A2P 10DLC. Twilio account has zero brand registrations, so every SMS returns error 30034 (carrier-blocked). Register Brand + Campaign in Twilio, attach the sending number to the Meet Cute Messaging Service. Texting will not deliver until this is approved.
2. Set prod env (Fly secrets): SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN / SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN, and enable Seer in the Sentry UI (docs/OBSERVABILITY.md).
3. Point the Twilio Conversations service onMessageAdded webhook at /api/sms/conversations so group transcripts populate the console.
4. Verify the production Resend sender domain (`RESEND_FROM`); default `meet-cute.app` returns 403 so magic-link email fails outside dev.
5. Community admissions voting (V2 defer, see DECISIONS).

## Blockers
- (none)

## Open questions
- Should health scoring include metrics like message latency (hours since last activity)?
- Recommend running Twilio webhooks through ngrok in dev, or use a test Conversations Service?
