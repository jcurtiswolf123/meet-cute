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

## In progress
- (none)

## Next (prioritized)
1. Review demo video pacing and re-record if any scenes feel rushed or empty.
2. Optionally host demo on hellomeetcute.com or use for investor/social cutdowns.

## Blockers
- (none)

## Open questions
- Prefer a different voice (male narrator, slower pace, or branded script tweaks)?
