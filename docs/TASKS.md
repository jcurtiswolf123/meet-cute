# meet-cute : Tasks

_Lightweight backlog. Move items between sections as they progress._

## In progress
- (none)

## Backlog (prioritized)
- [ ] Set prod Sentry env (Fly secrets) + enable Seer AI autofix (docs/OBSERVABILITY.md)
- [ ] Point Twilio Conversations onMessageAdded webhook at /api/sms/conversations
- [ ] Community admissions voting (V2)
- [ ] Extend Sentry context with match/person metadata for error triage
- [ ] Health scoring: add latency metrics (hours since last activity)
- [ ] Operator bulk actions: close expired intros, resend stalled intros
- [ ] Member feedback on matches post-connection

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
