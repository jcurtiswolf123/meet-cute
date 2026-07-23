# meet-cute : Tasks

_Lightweight backlog. Move items between sections as they progress._

## In progress
- [ ] Complete reviewed launch deployment and production canary
- [ ] Obtain counsel review of legal, consent, retention, and safety language

## Backlog (prioritized)
- [ ] Automated photo pre-screening before high upload volume
- [ ] Retire unused legacy Fly volumes during a maintenance window
- [ ] Community admissions voting (V2)
- [ ] Extend Sentry context with match/person metadata for error triage

## Done (2026-06-30 polish)
- [x] Set prod Sentry env (Fly secrets) - verified all five secrets present
- [x] Point Twilio Conversations onMessageAdded webhook at /api/sms/conversations - already wired to hellomeetcute.com, endpoint live + signature-guarded
- [x] Health scoring: hours-level latency (ageShort + relativeAge); console shows relative last-activity ("3h ago")
- [x] Operator bulk actions: bulkResendStalled + bulkCloseExpired on the console toolbar, shared thresholds (stalledWhere/expiredWhere); verified end to end
- [x] Member feedback post-connection: surfaced kind:"feedback" notes on the conversation detail page + per-intro "Ask how it went" / "Resend invite" / "Close intro" quick actions

## Done
- [x] Task 1: Prisma schema evolution (voucherName, voucherContact, recommendation, conversationSid, IntroMessage model) (2026-06-28)
- [x] Task 2: Bot SMS composer with LLM + fallback template, emoji-free output (2026-06-28)
- [x] Task 3: Twilio Conversations webhook for group thread logging (2026-06-28)
- [x] Task 4: Operator console UI (conversations list + detail + jump-in form) (2026-06-28)
- [x] Task 5: Vouch/recommendation on application + profile display (already complete, verified) (2026-06-28)
- [x] Task 6: Member visibility scoping to connections-only (/app/connections + [id] with guard) (2026-06-28)
- [x] Task 7: Sentry error handling in SMS/Conversations webhooks (2026-06-28)
- [x] Task 8: Typecheck, build, docs, commit, push (2026-06-28)
- [x] Set up project context system (2026-06-24)

## Icebox (maybe later)
- [ ] In-app Vouch system (peer voting on candidate profiles)
