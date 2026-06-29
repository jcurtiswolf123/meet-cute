# meet-cute : Decision Log

_Append-only. Newest at top. Each entry: what was decided, why, and what was rejected._

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
