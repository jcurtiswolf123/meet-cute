# mutuals : Tasks

_Lightweight backlog. Move items between sections as they progress._

## In progress
- [ ] Obtain a forced Twilio re-vet for A2P campaign errors 30882 and 30908.
  The 2026-07-23 replacement failed in the same second with the same findings.
- [ ] Obtain counsel review of legal, consent, retention, and safety language

## Backlog (prioritized)
- [ ] Scheduled reminder for recommenders who have not written back after 48
  hours. Today the nudge only goes out when the applicant presses the button on
  `/apply/thanks`, so an applicant who never returns to the page has two friends
  who were asked once and forgotten.
- [ ] Backfill gender for the existing roster (28 members). It was never
  collected before 2026-08-03, so the studio gender filter matches nothing for
  anyone who joined earlier.
- [ ] A studio view of nominations. They are recorded and attributed
  (`Nomination.personId`), and a converted one is marked "put them forward" on
  the person page, but there is nowhere to see who is referring whom.
- [ ] Automated photo pre-screening before high upload volume
- [ ] Retire unused legacy Fly volumes during a maintenance window
- [ ] Community admissions voting (V2)
- [ ] Extend Sentry context with match/person metadata for error triage

## Done (2026-08-12)
- [x] The studio keeps its scroll position on Back, and a profile's back control
  returns to the page it was opened from
- [x] `/studio/applicants`: a photo-first review board with full-size review,
  keyboard paging between photos and people, and Approve/Decline in place
- [x] Directory slimmed to a directory: applicant triage moved to the board, a
  count in the sidebar, a result count and a clear-filters link, `/` to search

## Done (2026-08-06)
- [x] Any two friends accept an applicant: the opposite-gender rule and the
  "single" wording are gone from the gate, the form, and the copy
- [x] `/refer`: put somebody forward before they apply, with the words counting
  as one of their two recommendations when they do

## Done (2026-06-30 polish)
- [x] Set prod Sentry env (Fly secrets) - verified all five secrets present
- [x] Point Twilio Conversations onMessageAdded webhook at /api/sms/conversations - already wired to hellomutuals.com, endpoint live + signature-guarded
- [x] Health scoring: hours-level latency (ageShort + relativeAge); console shows relative last-activity ("3h ago")
- [x] Operator bulk actions: bulkResendStalled + bulkCloseExpired on the console toolbar, shared thresholds (stalledWhere/expiredWhere); verified end to end
- [x] Member feedback post-connection: surfaced kind:"feedback" notes on the conversation detail page + per-intro "Ask how it went" / "Resend invite" / "Close intro" quick actions

## Done
- [x] Build and verify the Twenty-style Studio shell, hover-expanding sidebar,
  full member signup and profile journey, signed email decision capture, and
  one joint connection email after mutual consent (2026-07-23)
- [x] Deploy and verify super-admin operator administration, including Jess
  provisioning, ordinary-operator restrictions, production role QA, and the
  Fly version 107 canary (2026-07-23)
- [x] Complete reviewed launch deployment and production canary (2026-07-23)
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
