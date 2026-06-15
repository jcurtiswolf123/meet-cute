# Meet Cute

Premium matchmaking, built as one app: meet, date, stay together. This is a working v1 of the relaunch plan, with all five pieces wired and verified end to end.

## What is in here

| Piece | Where | What it does |
|---|---|---|
| Consumer app | `/app` | Profile, one curated suggestion at a time (no swipe feed), mutual opt-in, the vouching layer, referrals. |
| Concierge bot | `src/lib/concierge.ts`, `/app/matches` | On a mutual yes it names a venue and offers specific slots. Both tap, overlap confirms, no overlap gets one more round, then a human steps in. Sends a one-way .ics, a morning-of nudge, and a 24h post-date check-in. Propose, never coordinate. |
| Vouching | `src/lib/social.ts` | Passive vouches on profiles, plus the post-match "ask a mutual friend for the inside scoop." The mutual-friend graph is derived from data we own (referrals, dinner co-attendance, vouches), not LinkedIn or a contacts scrape. |
| Matchmaker backend | `/studio` | Searchable, filterable roster. Match pipeline (suggested to together). Per-person view with full history, notes, vouches, the social graph, dinners, coaching. |
| Co-pilot | `/studio/copilot`, `src/lib/copilot.ts` | Internal RAG assistant: find candidates, recall notes, summarize a person, find stale singles, draft intros. Uses Claude when funded, falls back to a real local intent engine over the live roster otherwise. |
| Brand + funnel | `/`, `/apply`, `/dinners`, `/coaching` | Landing, application, dinners, coaching bench. |

## Run it

```bash
npm install
npm run db:reset     # create SQLite db + seed roster, dinners, matches, vouches
npm run dev          # http://localhost:3009
```

Sign in at `/login` (demo login: pick any seeded member to see the app, or an operator (Jess, Zoe, Erik) to see the studio).

Scripts:

```bash
npm run demo:bot         # exercises the full concierge flow with fast-forwarded time
npm run concierge:tick   # the cron entrypoint (run every ~15 min in prod)
```

## AI providers

The AI layer (`src/lib/ai.ts`) is provider-agnostic and tries providers in order, picking the first that is configured and responds:

1. **NVIDIA** (`NVIDIA_API_KEY`) - the default. Free, OpenAI-compatible endpoint at `integrate.api.nvidia.com`. Llama 3.3 70B for the co-pilot chat, `nv-embedqa-e5-v5` (1024-dim, asymmetric query/passage) for embeddings.
2. **Claude** (`ANTHROPIC_API_KEY`) - chat fallback.
3. **OpenAI** (`OPENAI_API_KEY`) - embedding fallback.
4. **Local** - if nothing is funded: the co-pilot runs a real intent engine over the live roster (find candidates, recall notes, summarize, stale-finder, draft intros) and embeddings use a deterministic lexical vector. The product always runs.

The co-pilot UI shows which provider answered (a badge: "NVIDIA Llama 3.3", "Claude", or "local engine"). After switching providers or bulk-editing profiles, re-embed with `npm run embed`.

## Stack

Next.js (App Router) + React 19, TypeScript, Tailwind, Prisma + SQLite. SQLite is the source of truth for v1 and mirrors the Airtable schema in the plan, so an Airtable sync can be layered on without a model change.

## Production cron

Run the concierge sweep on a schedule:

```
*/15 * * * * cd /path/to/meet-cute && node --env-file=.env --import tsx scripts/concierge-tick.ts
```

In a real deployment the bot would also send over SMS / WhatsApp (Twilio) instead of writing in-app messages. The message-sending is isolated in `concierge.ts` (`say`), so swapping the transport is a one-function change.
