# Meet Cute: Product Brief for Jessica

Historical operator brief. Current operating instructions are in
`docs/OPERATOR-GUIDE.md` and current release state is in `docs/STATUS.md`.

**Live Demo**: https://meet-cute.fly.dev  
**Status**: Tier 0 Production-Ready (Auth, Safety, Legal, Data Rights)  
**Date**: June 15, 2026

---

## What is Meet Cute?

Meet Cute is a curated matchmaking platform for people seeking serious relationships. Unlike dating apps, there is no swiping, no matching algorithm, no endless browsing. Instead:

**For Members:**
- You get one vetted introduction at a time
- Introductions are vouched for by people you both trust (mutual connection endorsement)
- The concierge books the actual restaurant table (no "we should grab drinks sometime" that never happens)
- After the date, you get optional coaching to reflect on the connection
- You can attend monthly dinners with other roster members (the room is the product)

**For the Operator / Co-Pilot:**
- You manage the member roster, matches, and concierge bookings
- You get a co-pilot assistant that understands natural language operator imperatives
- You can suggest matches, auto-book dates, add notes, and moderate safety reports all in real-time

---

## How Members Use It

### Signup
1. Member lands on https://meet-cute.fly.dev
2. Clicks "Request an introduction" → email login form
3. Enters email → receives a magic link (15-min valid)
4. Clicks link → asked to create profile (name, age, photo, brief bio)
5. Agrees to ToS + Privacy Policy + confirms 18+
6. Takes them to member dashboard

### Dashboard
- **One Suggestion at a Time**: Member sees a single potential match with:
  - Photo(s)
  - Name, age, location
  - Brief why they're matched (mutual endorsement, values, vibe)
  - "Pass" or "Yes" buttons
- **If Yes**: Concierge is notified to book a date (they wait for confirmation email)
- **If Pass**: Next suggestion loads automatically
- **Settings**: Can view blocked members, export data, delete account

### Safety
- Members can block someone (they can't see each other)
- Members can report someone (screenshots, concerns, unsafe behavior)
- Pending reports go to operator moderation queue

---

## How Operators Use It

### Access
- Operator login via `/studio` (auth required)
- Gets a dashboard with roster, pipeline, co-pilot chat, and moderation queue

### Co-Pilot Natural Language Commands

The co-pilot understands imperatives like:

1. **Suggest**: "Suggest Alex and Jamie for each other"
   - Creates a mutual match record
   - Notifies both members
   - Puts them in the suggestions queue

2. **Book**: "Book the date for Alex and Jamie"
   - Finds their mutual match
   - Opens a concierge thread (if needed)
   - Auto-confirms the soonest available restaurant slot
   - Sends both members calendar invite + nudge SMS (via Twilio, Tier 1)
   - Advances them to "Date Scheduled" stage

3. **Note**: "Note on Alex: Wants to eventually move to SF, engineer at Google"
   - Adds context to the member profile
   - Visible to operator only

4. **RAG / Knowledge Base**: "What's Alex's situation?"
   - Retrieves profile, match history, notes, coaching sessions
   - Falls through to normal co-pilot if not an imperative

### Moderation Queue
- **Photos**: Grid of pending photos with approve/reject (automated moderation scoring optional in Tier 1)
- **Reports**: List of member reports with reason + details, resolve button

### Full Dashboard (Roadmap)
- Roster grid (name, photo, age, stage, notes)
- Pipeline metrics (matched, scheduled, first date, together, coached)
- Social graph (who endorsed who, mutual connection viz)
- Dinner management (attendees, follow-up)
- Coaching session notes

---

## Member Journey States

```
suggested → mutual_yes → date_scheduled → first_date → second_date → relationship (together)
                                                                    ↓
                                                                  exit
                                                      (closed, no longer dating)
```

Each stage triggers notifications and operator visibility.

---

## Next Steps to Public Launch

### Immediate (This Week)
- [ ] **Counsel Review**: /privacy and /terms pages reviewed by legal (draft currently live)
- [ ] **Hero Video Asset**: Acquire or create /hero.mp4 (6 min cinematic, warm film-grained intimacy aesthetic; spec in design notes)
- [ ] **Reseed Roster**: Wipe synthetic test data, start with empty real roster (can add you + a few trusted beta members)

### Design Polish (Tier 1, Next Week)
- [ ] **In-App Member UI**: Single-suggestion screen (dark espresso option, manifesto tone, whitespace-heavy layout)
- [ ] **Copy Rewrite**: "How it works" sections, button labels, onboarding flow
- [ ] **Full Design Spec**: 12 changes identified (type scale, section alternation, champagne hairlines, photo direction, buttons, footer)

### Operations (Tier 1, Launch Week)
- [ ] **Twilio SMS**: Concierge date-book confirmations + reminders (API integrated, needs Twilio account)
- [ ] **Sentry Observability**: Error tracking in production
- [ ] **Volume Backups**: Fly Postgres automated backups configured
- [ ] **Email Domain**: Verified sending domain (josh@ or meet-cute@)

### Go Live
- [ ] DNS pointed to meet-cute.fly.dev
- [ ] Public signups enabled (currently works)
- [ ] Operator invite sent to you with co-pilot walkthrough

---

## Current Architecture

### Tech Stack
- **Frontend**: Next.js 15, React, Framer Motion (motion library)
- **Backend**: Next.js API routes, Prisma ORM
- **Database**: Fly Postgres (managed)
- **Auth**: Magic-link via Resend email, opaque DB-backed sessions (revocable)
- **AI Co-Pilot**: NVIDIA hosted Llama 3.1 8B (sub-second latency)
- **Storage**: Local volume in dev, S3/Blob-ready in prod
- **Hosting**: Fly.io (auto-scaling, one-click deployments)

### Security (Tier 0 Complete)
- Magic-link tokens: Single-use, 15-min TTL, SHA-256 hashed at rest
- Session tokens: Opaque (random 256-bit), revocable, DB-backed
- Photo uploads: Type + size allowlist, path-traversal validation
- Rate limiting: Per-IP + per-email (prevent email-bombing)
- Data rights: Export (JSON), delete (cascade), block/report

---

## Key Decisions

1. **Public Signups** (not invite-only)
   - Requires heavy safety (moderation queue, blocking, reporting)
   - In place and ready

2. **Magic-Link Auth** (not SMS)
   - Lower friction, works globally
   - Resend handles email delivery

3. **Co-Pilot Over Tool-Calling**
   - Deterministic action layer (detect imperatives, execute via DB)
   - More reliable than LLM tool-calling on free tier models

4. **Warm Design Aesthetic**
   - Espresso dark + champagne accents + cream + claret
   - Deliberately distinct from AI-default purple/blue gradients

5. **Stay on Fly.io** (for now)
   - Postgres managed, backups, auto-scaling
   - Easy deploy cycle (git push)

---

## Questions for You

- **Timing**: When do you want to go public (next week, next month)?
- **Beta**: Should we beta with a small invite cohort first, or open signups immediately?
- **Content**: Any adjustments to the manifesto copy or "how it works" section?
- **Operator Workflow**: Any additional commands or dashboard features you need before launch?

---

## To Get Started

1. **See it live**: https://meet-cute.fly.dev (click "Request an introduction" to see signup flow)
2. **Operator access**: Let Joshua know and he'll create your operator account + send co-pilot walkthrough
3. **Help**: Ask the co-pilot anything ("what's on the roster", "suggest X and Y", "book the date for X", etc.)

---

## What You're Managing

As the operator, you're the curator, concierge, and safety guardian:

- **Curator**: Choose who gets suggested to whom (based on values, vibe, endorsements)
- **Concierge**: Confirm dates, book tables, send nudges, collect feedback
- **Safety Guardian**: Review photos, investigate reports, block bad actors
- **Coach**: Optional 1-1 follow-ups after first dates (in Tier 1)

You're running a matchmaking business, not an app. The app is the tool; you're the human magic.

---

**Contact**: Josh (joshua@shiftsupportnetwork.com) or just ask the co-pilot on the operator dashboard.

**Repo**: ~/Projects/meet-cute (production branch: main)
