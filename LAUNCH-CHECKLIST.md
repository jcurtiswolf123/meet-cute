# Meet Cute: Public Launch Checklist

**Current Status**: Production Ready (Tier 0 + Design Complete)  
**Live**: https://meet-cute.fly.dev  
**Last Updated**: June 15, 2026

---

## What's Ready Now (✓)

- [x] **Magic-link authentication** (email signup, opaque sessions, revocation)
- [x] **Safety infrastructure** (photo moderation, blocking, reporting, 18+ gate)
- [x] **Legal framework** (privacy policy, terms, consent, data deletion)
- [x] **Operator features** (co-pilot: suggest/book/note, moderation queue)
- [x] **Landing page** (cinematic hero, design polish, warm aesthetic)
- [x] **Member experience** (one-at-a-time suggestions, refined UI)
- [x] **Full-stack security** (host-injection hardened, email-bombing blocked, path-traversal fixed)
- [x] **Responsive design** (mobile, tablet, desktop tested)
- [x] **Hero video asset** (8.1MB cinematic fallback, already in place)

---

## Before You Can Launch Publicly

### Legal (HIGH PRIORITY)
- [ ] **Schedule legal review** of /privacy and /terms
  - Email counsel with links to live pages
  - They'll want to review: data retention, consent language, cross-border transfer rules
  - Expected turnaround: 3-5 business days
  - Joshua to own

### Operations (MEDIUM PRIORITY)
- [ ] **Verify email domain** in Resend
  - Current: placeholder `hello@meet-cute.app` (won't work)
  - Set `RESEND_FROM` to a Resend-verified domain (josh@shiftsupportnetwork.com? meet-cute.com?)
  - Test sending a magic link to yourself
  - Joshua to own

- [ ] **Reseed database** with empty roster
  - Current: synthetic demo data (Alice, Bob, etc.)
  - Before public launch: wipe and start fresh
  - Option A: Reset Fly volume (destroys all data, starts clean)
  - Option B: Use prisma to delete demo records
  - Add yourself as first operator for testing
  - Joshua to own

- [ ] **Set Fly secrets** (verify all set)
  - `RESEND_API_KEY`: ✓ (already done)
  - `RESEND_FROM`: ✗ (set this to verified domain)
  - `NEXT_PUBLIC_APP_URL`: ✓ (https://meet-cute.fly.dev)
  - `STUDIO_DEMO_PASSWORD`: ✗ (optional, gates operator access)
  - Run: `fly secrets set KEY=value`

- [ ] **Alert Resend** that you're going public
  - Let them know volume expectations
  - Ask about rate limits on magic-link sends (currently limited to 10/hr per IP, 3/15min per email)
  - Low volume at launch, so not urgent

### Operations (AFTER LAUNCH)
- [ ] **Twilio SMS** (concierge date confirmations)
  - Swap transport in `src/lib/concierge.ts` from in-app to SMS
  - Get Twilio account + phone number
  - Run `scripts/concierge-tick.ts` on 15-min cron
  - Timeline: Tier 1, after public launch

- [ ] **Sentry** (error tracking)
  - Add Sentry to Next.js config
  - Wire client + server error boundaries
  - Timeline: Tier 1, first week of real users

- [ ] **Volume backups** (Fly SQLite)
  - Set up automated snapshots of the Fly volume
  - Or migrate to Neon Postgres when roster grows
  - Timeline: Tier 1, after 50+ members

---

## How Jessica Gets Started

### 1. First Access
```
Joshua sends you operator credentials + login link
You go to: https://meet-cute.fly.dev/login
Check your email for magic link, click it
You land in: /studio (the command center)
```

### 2. Explore the Studio
- **Roster** (searchable): all members with photos, profiles, notes
- **Pipeline** (metrics): suggested → mutual_yes → date_scheduled → together
- **Copilot Chat** (top): natural language commands
- **Moderation Queue** (/studio/moderation): approve photos, resolve reports

### 3. Try Member Role
```
Joshua sends you a test member account (or you create one)
Go to /login, use that member's email
You see: one suggestion at a time
Try: "Yes, introduce us" and "Pass"
You'll understand the member experience
```

### 4. Key Commands in Copilot
```
"Suggest Alice and Bob for each other"
→ Creates match, notifies both (they'll see each other next time they open the app)

"Book the date for Alice and Bob"
→ Opens concierge thread, finds first available slot, sends calendar invites

"Note on Alice: loves sushi, prefers evening dates"
→ Adds to her profile (visible to you only)

"Who's new on the roster?"
→ Shows recent members

"What's the match rate this week?"
→ Shows metrics from the pipeline
```

### 5. Daily Workflow (Once Public)
- Check **moderation queue** first thing (any photos to approve? reports to handle?)
- Review **new applicants** (accept into roster or decline)
- **Suggest matches** based on values, vibe, mutual connections
- Use **co-pilot** to confirm dates once both say yes
- Track **pipeline** to see how many are dating, coaching, etc.
- Respond to **member questions** (they can email or message in the app)

---

## Timeline to Public Launch

### Option A: Launch This Week (Conservative)
- [ ] Legal review (parallel with next steps)
- [ ] Email domain verified in Resend
- [ ] Database reseeded
- [ ] Jessica trained + tested
- **Friday 6/21**: Open signups, expect 50-100 applications

### Option B: Launch Next Week (Comfortable)
- [ ] Legal review complete
- [ ] Twilio SMS wired (concierge via text)
- [ ] Sentry set up
- [ ] Jessica & team fully trained
- **Friday 6/28**: Open signups, smoother ops

### Option C: Launch in 2 Weeks (Premium)
- [ ] All of Option B +
- [ ] Volume backups automated
- [ ] Real hero video tested
- [ ] 10+ beta members in system (test flows, edge cases)
- **Friday 7/5**: Full public launch with confidence

**Joshua's call** on which path.

---

## Post-Launch Monitoring

Once public, check daily:
1. **Magic-link delivery** (any bounces? slowness?)
2. **Moderation queue** (is it clear or backlogged?)
3. **Error logs** (Sentry dashboard when added)
4. **Member feedback** (app experience, matching quality)
5. **Co-pilot latency** (NVIDIA free tier holding up?)

---

## Key Docs

- **JESSICA_BRIEF.md**: What Meet Cute is, how to use it, next steps
- **STATUS_2026-06-15.md**: Full production sprint recap, what's complete, known limitations
- **PRODUCTION-PLAN.md**: Tier 0/1/2 roadmap, sequence of work
- **docs/UI-UX-PRODUCTION-RULES.md**: Design standards we built against
- **docs/PRODUCTION-READINESS.md**: (old, from earlier iteration, still useful for context)

---

## Questions?

- **Joshua**: Production decisions, legal/counsel, secret setup, launch timing
- **Jessica**: Operator workflow, co-pilot commands, member experience
- **Technical**: Code lives at ~/Projects/meet-cute, deploy via `fly deploy`

---

## The Bar is High

This app is built for quality, not volume. Every member is vouched for, every date is concierge-booked, every photo is reviewed. The moment you open signups, treat it like a curation job, not a growth game.

Let's get the first real members in. 💌

---

**Deploy**: `fly deploy`  
**Logs**: `fly logs`  
**Secrets**: `fly secrets list`  
**Live**: https://meet-cute.fly.dev
