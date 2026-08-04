# The application, end to end

Every step from a stranger arriving at `/apply` to an accepted member, and every
email that leaves along the way. Current as of 2026-08-04.

The one thing to hold onto: **submitting the form accepts nobody.** Two friends
of the opposite gender answering is what gets someone in. The form is how we ask
them; the friends are the gate.

## 1. Sign in, before anything is asked

`/apply` when signed out is one field: an email address.

1. **They enter an email.** A one-time token is created and a magic link is
   emailed. This send is direct rather than queued, because a link that arrives
   in a minute is useless.
2. **The token is created before the send**, so an operator can still let
   someone in when mail is down.
3. **No Person row exists yet.** It is created when the link is clicked. This is
   why an unrequested link is the only hole the funnel cannot see into, and why
   step 4 exists.
4. **If the link goes unused, one recovery email at 3 hours** (`signin_unused`).
   The link expires in 15 minutes, so 3 hours means they clearly did not click,
   and it is still the same day. Withdrawn the instant they sign in. It carries
   no token: it prefills the address on the form and they ask for a fresh link
   themselves.
5. **On clicking the link**, the row is created. `name` is seeded from the email
   local part and `city` defaults to NYC. **Neither counts as an answer.** That
   distinction is load-bearing: treating them as answers once dropped people on
   step three of a form they had never started.
6. **The unfinished-application chase is queued at sign-in**, due in 24 hours
   (`application_unfinished`), and withdrawn when they submit. It names what they
   already did, because someone who uploaded five photos is not a lead to
   re-pitch.

## 2. Six questions, one screen at a time

Each screen is an ordinary server action that **commits on its own** before the
next is drawn, so stopping halfway leaves something behind rather than nothing.
Where someone is lives on the row as `applicationStep`, not in a session, so
they resume on the right step from any device or from an email days later.

| # | Step | Asked for | Required |
|---|---|---|---|
| 1 | `name` | First and last name | Both. The surname stays private until two people have said yes |
| 2 | `city` | NYC, SF or LA, plus an optional second city | Primary only |
| 3 | `gender` | Woman, man, non-binary | Yes. The opposite-gender rule is checked against it |
| 4 | `birthdate` | Date of birth | Yes, and 18 or older |
| 5 | `photo` | At least one photo | Yes. Live immediately, no review queue |
| 6 | `extras` | Email shown read-only, what you are looking for, Instagram, LinkedIn, mobile, terms, SMS opt-in | Terms only |

Notes that matter:

- **Every step works before React hydrates.** Plain form posts, errors returned
  in the query string.
- **A rejected step hands back what was typed**, in the query string. It cannot
  be stored, because half a name is not a name.
- **SMS consent is separate and never a condition of joining** (CTIA, A2P
  10DLC). Skipping it means introductions by email.
- **`basicsAt` is stamped only when step 6 is answered.** A part-finished
  application never enters the review queue.

## 3. Naming the two friends

Step 7 of 7, at `/apply/friends`, in the same shell as the other six. The ask
is specific to the gender they gave: **"Name two single men who know you well"**,
or two single women. Single is guidance, not a check: the vouchers are the
warmest leads Mutuals sees, and they only become members if they are available
to be one.

- **A recommender who is already a member counts as one of the two**, and only
  one new friend is needed. That member is asked to vouch back
  (`vouch_back_request`).
- One request per person per address. Naming the same friend twice is a typo.
- Submitting here stamps `appliedAt`. **Status stays `applicant`.**

Three emails leave at this moment:

| Email | To | Says |
|---|---|---|
| `application_received` | The applicant | We have it, and it is now up to your friends |
| `recommendation_request` x2 | Each friend | Someone named you, here is a link |
| `vouch_back_request` | The member, if fast-tracked | Your friend is applying, vouch back |

## 4. The friends answer

The link goes to `/r/<token>`. **No account, no sign-in, nothing to install.**
The token is a capability, deliberately not a link a mail scanner can follow
into a vouch.

Two ways to answer, both real:

- **Tap** ("Yes, I vouch for X"). Counts toward the gate on its own. Most people
  are on a phone, and the gap between a tap and a paragraph is the gap between
  an answer today and no answer at all.
- **Words.** Also counts, and is the only thing that puts a quote on the profile
  and into the introduction email. Words can be added later on top of a tap.
- **Decline.** Quiet and last, so it is never the easy option. Counts toward
  nothing, cancels that friend's reminders, and is final. The applicant is never
  told who declined.

**Nudges if they go quiet: 48 hours, 5 days, 10 days** (`recommendation_reminder`),
all cancelled the moment they answer. The applicant can also nudge by hand from
the waiting page, rate limited to 3 an hour.

After each answer:

| Email | To | Only when |
|---|---|---|
| `recommendation_thanks` | The friend | Their first answer. Wording differs for a tap and asks for words, with a link back |
| `recommendation_received` | The applicant | The gate is not yet satisfied. Says "wrote" or "vouched" truthfully |
| `recommender_follow_up` | The friend, 36h later | They are not already a member. This is the growth ask |

## 5. Acceptance

**The second qualifying answer accepts automatically.** No operator involved.

- Qualifying means opposite gender: a woman needs two men, a man needs two
  women, non-binary applicants and recommenders count either way.
- The transition is a guarded conditional update, so two friends answering at the
  same instant accepts once.
- The words from a friend who wrote are copied to the profile and are what an
  introduction is drafted from.
- `application_approved` goes to the new member.

**Operator approval still exists and is now the exception.** In the studio it
reads "Approve early" when the friends have not written, and it demands a
one-line reason, recorded on the row as `acceptOverrideReason` with
`acceptedById`. Approving early switches off the growth engine: nine applicants
approved by hand in an hour on 3 August meant nine recommenders with no reason
to answer.

## 6. What happens to people who stop

| They stopped at | What we have | What chases them |
|---|---|---|
| Never clicked the link | An email address | `signin_unused` at 3h |
| Signed in, answered nothing | An address | `application_unfinished` at 24h |
| Mid-way through the six steps | Every answer up to that point | `application_unfinished` at 24h, landing on the step they stopped at |
| Finished, friends silent | Everything | The three reminders to the friends |

## Known gaps

- **Reply rate is 50%** (8 of 16 real asks). That number, not the form, is what
  the whole loop multiplies through.
- **Nobody is retroactively asked for a surname.** Members who applied before it
  was required keep a one-word name.

## How to check any of this yourself

```bash
npx tsx scripts/apply-funnel.ts                   # read-only: the live funnel
npx tsx scripts/prod-application-walk.ts --yes    # walks the whole thing on the live site, then deletes itself
```

The walk signs up, answers all six questions, uploads a photo, names two
friends, has one write and one tap, and asserts the gate opens on the second and
that every email reaches the provider. It only touches addresses it generates
and it emails nobody but Josh.
