# meet-cute : Status

_Single source of truth for current state. Update at the end of every work session._

Last updated: 2026-06-27

## Now (current state)
- Live demo scenario reset: **Maya Rosen ↔ Alex Chen** match (suggested, both undecided). One command: `npm run demo:setup`.
- Dev server: http://localhost:3009 · demo login at `/studio/login` and `/login`.
- Product demo video: `public/demo/meet-cute-demo.mp4` (~2:55). Regenerate with `npm run demo:video`.

## Done
- Demo setup script: `npm run demo:setup` (resets Maya/Alex fixture + prints sign-in links).
- Operator login page at `/studio/login`.
- Demo video pipeline: `scripts/make-demo-video.ts`, npm script `demo:video`, metadata in `public/demo/demo-meta.json`.
- Playwright added as dev dependency for screen recording.
- QA pass on signup + operator dashboard (branch `qa/operator-dashboard-signup`), fixes shipped:
  - Signup phone validation. `normalizePhone` accepted "123" as "+123" and the SMS intro flow could never text it. Added `isTextablePhone` (10 to 15 digits) on the member application and operator quick-add.
  - Apply form now shows inline field errors via `useActionState` and preserves typed input on a failed submit (was throwing into the full-page error boundary and wiping the form).
  - `appliedAt` is now stamped on a completed application. It was never written, so the operator accept-rate metric was dead and the applicant queue could not tell real applicants from abandoned magic-link clicks.
  - Studio Directory: New Applicants queue gated on `appliedAt`; accept rate measured within the application funnel (can no longer exceed 100%); fixed the "Name," dangling comma when age is unknown.
  - Matchmaking composer prefills the intro "about" bullets from each person's bio (only when empty), so the operator does not retype known facts.
  - Email helper logs the dev sign-in link when a real send fails (e.g. unverified domain), so local signups stay testable. Never logs in production.

## In progress
- (none)

## Next (prioritized)
1. Verify the production Resend sender domain (`RESEND_FROM`) is added and verified; the default `meet-cute.app` returns a 403 from Resend so magic-link email currently fails outside dev.
2. Review demo video pacing and re-record if any scenes feel rushed or empty.
3. Optionally host demo on hellomeetcute.com or use for investor/social cutdowns.

## Blockers
- (none)

## Open questions
- Prefer a different voice (male narrator, slower pace, or branded script tweaks)?
