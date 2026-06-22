# Meet Cute - Quick Start

**Live app:** https://meetcutehq.com

Meet Cute is an invite-only, matchmaker-run dating service. There is no swiping:
a human operator (matchmaker) curates one introduction at a time, both people
opt in, and a concierge bot books the first date. Everyone signs in the same
way: a passwordless magic link sent to their email. What you can see is
determined by one flag on your account: members get the app, operators get the
studio.

---

## Two surfaces

| Surface | URL | Who | What they do |
|---|---|---|---|
| **Member app** | `/app` | Applicants & active members | Build a profile, review one curated suggestion at a time, opt in/pass, get a date booked, vouch for friends, manage safety + privacy. |
| **Matchmaker studio** | `/studio` | Operators only | Vet applicants, search the roster, create suggestions, run the pipeline, moderate photos/reports, manage the team, use the AI co-pilot. |

Members can never see or reach the studio. Every `/studio/*` route redirects
non-operators to `/app`, and every operator action is enforced server-side.

---

## Member workflow

1. **Apply** at `/apply` → enter email → click the sign-in link.
2. **Complete the application**: name, date of birth (18+ gate), city, what
   you're looking for, and consent to Terms + Privacy.
3. An operator **vets and approves** you (status goes `applicant → active`).
4. **Build your profile** at `/app/profile`: headline, bio, what you're looking
   for, deal-breakers, and photos (reviewed before others see them).
5. **For You** (`/app`) shows **one** introduction at a time with the
   matchmaker's note on why. Choose **Yes, introduce us** or **Not this time**.
6. If **both** say yes, it becomes mutual and the **concierge** takes over in
   `/app/matches`: it proposes a venue + specific time slots; when your picks
   overlap it confirms and sends a calendar invite.
7. **Safety + privacy** in `/app/settings`: block or report anyone, export your
   data, or permanently delete your account and all its data.

## Operator workflow

1. Sign in → you land in `/studio`.
2. **Roster** (`/studio`): search/filter members; vet applicants (approve →
   active, or decline).
3. **Person view** (`/studio/person/[id]`): full history, notes, mutual-friend
   graph; one-click create a suggestion with a rationale.
4. **Pipeline** (`/studio/pipeline`): every match from suggested → together;
   see who's waiting on whom.
5. **Events** (`/studio/events`): create a dinner/gathering (theme, venue, city,
   date, capacity), then **one-click add invitees** from the roster; each
   checked member is added and **emailed automatically**. Manage RSVPs
   (invited/confirmed/attended/no-show) on the event page.
6. **Moderation** (`/studio/moderation`): approve/reject pending photos; resolve
   safety reports.
7. **Co-pilot** (`/studio/copilot`): your command line for the platform. As well
   as answering questions over the roster + notes, **typed commands run for
   real**:
   - `Match Maya and Alex`
   - `Invite Maya and Alex to the next NYC dinner` (adds + emails them)
   - `Create a NYC dinner at Via Carota on 2026-07-12 7pm`
   - `Book the date for Maya`
   - `Approve Maya's photos` · `Close the match for Maya` · `What needs my attention?`
8. **Team** (`/studio/team`): add another operator by email (sends them a
   sign-in link) or revoke access. You can't remove yourself or the last
   operator.

---

## Logins & testing

Everyone signs in with a magic link. For accounts whose inbox you don't control
(e.g. test accounts), mint a **direct one-click link** instead (single-use,
expires in 15 minutes):

```bash
npm run login-link -- jesswolflord@gmail.com   # operator → /studio
npm run login-link -- maya@meetcute.test        # member  → /app
npm run login-link -- alex@meetcute.test        # member  → /app
```

### Seed / reset the test scenario

```bash
npm run test:fixture
```

Creates two members (**Maya Rosen** and **Alex Chen**) and one curated
suggestion between them, reset to a clean "both undecided" state. Walk it:

1. Open Maya's link → on **For You** you'll see Alex suggested with the
   matchmaker's note → click **Yes, introduce us**.
2. Open Alex's link → he sees Maya → **Yes, introduce us**. It's now mutual.
3. Either member's **Matches** tab shows the concierge proposing a venue and
   time slots. Pick slots on both sides to see it confirm + send the invite.
4. Open Jessica's (operator) link → **Studio → Pipeline** shows the match
   advancing; **Roster**, **Moderation**, and **Team** are all here.

### Manage operators

```bash
npm run ops -- list
npm run ops -- add you@email.com "Your Name" NYC   # or use /studio/team
npm run ops -- remove someone@email.com
```

---

## Production notes

- **Photo uploads at scale:** set `BLOB_READ_WRITE_TOKEN` (Vercel Blob) as a Fly
  secret. Without it, uploads fall back to local disk on a single machine.
- **Schema changes:** apply with `npm run db:deploy` (never via the build).
