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

## Done
- Prisma schema: added voucherName, voucherContact, recommendation to Person; conversationSid to Match; created IntroMessage model.
- Bot composer (/lib/intro-bot.ts): LLM-based group intro with deterministic fallback, emoji-free graceful degradation.
- Conversations webhook (/api/sms/conversations): logs all group thread messages to IntroMessage transcript.
- SMS inbound webhook enhanced with Sentry error handling.
- Operator console (/studio/conversations): list view with health badges, opt-in state, last activity; detail view with full transcript + jump-in form.
- Member connections view (/app/connections): list of mutually connected people; detail view guarded by isConnectedTo().
- Sentry.captureException() integrated into error paths; no-op until SENTRY_DSN env var is set.

## In progress
- (none)

## Next (prioritized)
1. Community admissions voting (V2 defer).
2. Polish operator console health scoring logic (currently: exit/connected-quiet/waiting/no-reply/pending).
3. Extend Sentry context with match/person/operator metadata for better error triage.

## Blockers
- (none)

## Open questions
- Should health scoring include metrics like message latency (hours since last activity)?
- Recommend running Twilio webhooks through ngrok in dev, or use a test Conversations Service?
