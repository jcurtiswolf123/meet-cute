# Mutuals Operator Walkthrough

For Jess and other Mutuals operators. Last updated July 24, 2026.

Live site: `https://hellomutuals.com`

## The flow in one minute

Mutuals is operator-led. Members do not browse or swipe through the roster.

1. A prospective member applies, or an operator adds someone who has already asked to be matched.
2. An operator approves the applicant and confirms that each person is ready to match.
3. The operator chooses two people in Matchmaking and sends a private introduction to each person.
4. Each person sees the other person's profile and privately chooses Yes or No.
5. If both say yes, Mutuals connects them by email.
6. If either person passes, the introduction closes. The other person is not told who passed.
7. The operator monitors the introduction, follows up when needed, and coordinates any date details manually.

Important current limitation: email is the reliable production channel. As of July 24, 2026, carrier approval for Mutuals SMS is not complete. Do not depend on text messages, group texts, or text feedback requests until the SMS campaign is approved and delivery is verified.

## Links to keep handy

| Purpose | Link |
|---|---|
| Operator sign-in | `https://hellomutuals.com/studio/login` |
| Operator Studio | `https://hellomutuals.com/studio` |
| Public member application | `https://hellomutuals.com/apply` |
| Member sign-in | `https://hellomutuals.com/login` |
| Member app | `https://hellomutuals.com/app` |

## 1. Sign in to the Operator Studio

1. Open `https://hellomutuals.com/studio/login`.
2. Enter your operator email. Jess should use `jesswolflord@gmail.com`.
3. Open the email with the subject `Your Mutuals sign-in link`.
4. Click the link within 15 minutes.

The link works once. If it expired or was already used, return to the operator sign-in page and request a new one. Do not share a magic link. Each operator should use their own account.

Jess is a super admin. She has normal matchmaking access plus the ability to add and revoke other operator accounts from Team.

## 2. Know the Studio

The left menu has seven sections.

### Matchmaking

This is the main working screen. Use it to:

- See how many people are ready to match.
- Add a consented person directly to the roster.
- Choose two ready people.
- Optionally write one line on why the pairing makes sense.
- Send the introductions, each carrying the other person's own profile.
- Resend, close, or manually connect an introduction.
- Set follow-up reminders and request feedback.

### Conversations

Use this to monitor active introductions. It shows:

- Each pair.
- Each person's private decision as `Y`, `N`, or blank.
- A health label such as Awaiting both, Waiting on Sam, or Connected.
- The most recent activity.
- A transcript and operator message box.

The transcript can contain email decisions and any authorized SMS activity. Because SMS is not currently dependable, use the transcript mainly to confirm invitation and decision state.

### Directory

This is the roster and applicant review screen. Use it to:

- Review new applications.
- Approve or decline applicants.
- Search active members.
- Filter by city or gender.
- Sort by name, vouches, or how long someone has gone without a suggestion.
- Open a member profile to read their bio, preferences, recommendation, notes, match history, social links, and suggested candidates.
- Review failed email or SMS deliveries.

### Status

This is a long-term pipeline board. It tracks suggested pairs, mutual interest, dates, and relationships.

Do not confuse a suggestion with a sent introduction. `Create a match manually` on Status only creates an internal suggestion. It does not email either person. To send a real introduction, use Matchmaking.

### Events

Use Events to create a dinner or gathering, select eligible members, and email invitations. Venue selection, booking, seating, and calendar coordination remain manual.

### Co-pilot

Use Co-pilot to ask roster questions or run supported actions with plain language. Read-only prompts are useful for questions such as:

- `Show me candidates for Maya and why`
- `Who has not been suggested in 60 days?`
- `What needs my attention?`

Commands under Do can change live data. A command such as `Match Maya and Alex` or `Invite Maya and Alex to the next NYC dinner` runs for real. Check names, city, and intent before sending it.

For a high-stakes introduction, use the Matchmaking form. It gives you a clearer preview of who receives what.

### Team

Use Team to manage operator access. Jess can add and invite an operator or revoke an ordinary operator. Each operator has an individual account and signs in by magic link.

## 3. Invite someone to become a member

The normal invitation is the public application.

Send the person:

`https://hellomutuals.com/apply`

Suggested message:

> I would love to invite you to Mutuals. It is a curated matchmaking community in NYC and San Francisco. Start here: https://hellomutuals.com/apply. You will receive a one-time email link, then the application takes a few minutes.

What happens next:

1. The person enters their email at `/apply`.
2. Mutuals sends a one-time sign-in link.
3. The person completes the application. The form collects their name, city, date of birth, optional phone and social links, what they are looking for, a community recommendation, and legal consent.
4. Text consent is separate and optional. A member can join and be matched by email without agreeing to texts.
5. The completed application appears in Directory under New applicants.
6. An operator reviews the application and chooses Approve or Decline.
7. After approval, the member signs in at `/login`, completes or sharpens their profile, and chooses `Opt in to get matched` on the member Home screen.

Approving an applicant adds them to the active roster. It does not automatically mark them ready for an introduction. The member must opt in from the member app.

## 4. Add someone who already asked to be matched

Use this path for a person you have already spoken with who wants matchmaking, especially when you need to add them quickly.

1. Open Matchmaking.
2. Expand `Add someone to match`.
3. Enter their name and city.
4. Add their email. Email is the preferred baseline channel.
5. Add their mobile number only if useful.
6. Add Instagram, LinkedIn, and a short note when available.
7. Check the matchmaking consent box only if the person personally asked to be added and is ready to receive introductions.
8. Check the SMS consent box only if the person separately and explicitly agreed to Mutuals text messages at that number.
9. Click `Add person`.

This creates or updates the person and marks them ready to match.

The Add person action does not automatically send a welcome email or sign-in link. If you want the person to use the member app, send them:

`https://hellomutuals.com/login`

They must use the same email that you entered. They can then request a one-time sign-in link and edit their profile.

Do not use quick-add as a shortcut around consent. Never check either consent box based on an assumption, a referral, or someone else's request.

## 5. Review and prepare a member

Before matching someone, open their Directory profile and check:

- Their account is active.
- They are ready to match.
- Their city and age are accurate.
- Their email is present and spelled correctly.
- Their approved photo is current.
- Their bio, headline, and what they are looking for give the other person enough context.
- Their recommendation or voucher information is useful.
- There are no blocks, safety concerns, or conflicting notes.
- You have reviewed their recent match history to avoid repeating or overlapping an introduction.

If the person does not appear in the Matchmaking picker, they are usually not marked ready. Ask them to sign in at `https://hellomutuals.com/login`, open Home, and click `Opt in to get matched`.

## 6. Choose and send a match

1. Open Matchmaking.
2. In `New introduction`, choose the first person.
3. Choose the second person.
4. Optionally write one line in `Why this pairing`.
5. Read `What goes out` and confirm both delivery channels are correct.
6. Click `Send introductions`.

The button sends live invitations. There is no separate confirmation screen.

You do not write descriptions of the people. Each person is introduced to the
other through their own profile exactly as they wrote it, so there is nothing to
compose and nothing to get wrong on their behalf. If a member reads poorly in an
introduction, the fix is their profile, not the invitation.

`Why this pairing` is the one line you write, and both people see it. Keep it
about the pairing, not about either person: what the two have in common, or why
you think they would click. One sentence.

Do not include private notes, deal-breaker commentary, medical information, or
anything either person did not agree to share.

## 7. What each matched person receives

Mutuals sends each person a separate, private email carrying the other
person's whole profile, in that person's own words. The email:

- Names the proposed match.
- Shows their approved photo, age, neighborhood, city, and headline.
- Shows their bio, what they are looking for, deal-breakers, recommendation and
  voucher, and prompt answers.
- Shows your `Why this pairing` line, when you wrote one.
- Offers `Yes, introduce us`, which opens the same profile on a private page
  with `Yes, introduce us` and `No thanks` buttons.
- Also lets the recipient reply `Y` or `N` to the email.

The recipient can decide from the email alone. The private link is there for the
buttons and for anyone who prefers a page. It does not require a member sign-in,
it is unique to that introduction, and it should not be forwarded.

Someone who separately consented to text messages also gets a short text
pointing at the same private page. A text cannot carry a profile, so it is only
ever a nudge.

Decision rules:

- The first yes stays private while Mutuals waits for the other person.
- If both say yes, Mutuals connects them by email.
- If either person passes, the introduction closes.
- The other person is not told who passed.
- A person cannot change a decision by clicking the same link again.

After mutual consent, the people can say hello and choose a time. Mutuals does not automatically book a venue, reserve a table, or schedule the date.

## 8. Monitor an introduction

Start in Matchmaking for a quick view. Use Conversations for more detail.

### Common states

- `Awaiting both`: neither person has decided.
- `[Name] said yes`: one person opted in and the other is pending.
- `Connected`: both people said yes and the connection delivery completed.
- `Passed` or `Closed`: the introduction ended without a connection.

### Resend

Use Resend only for the person who is still pending. The system sends another invitation and replaces the older email link. Tell the person to use the newest email.

Conversations offers a bulk resend after at least three days with no reply. Do not resend sooner unless the person asked for another link.

### Close

Use Close when the introduction is no longer appropriate or has gone quiet. Closing cancels outstanding delivery work.

Conversations offers a bulk close after at least 14 days of silence.

### Connect now

`Connect now` forces both decisions to yes and sends the connection.

Use it only when both people have already given you explicit approval outside the platform, such as separate written replies or direct conversations. Do not use it to skip private consent or to see what happens.

### Ask for feedback and Jump in

These controls currently rely on authorized SMS. Since Mutuals SMS is not yet dependable, follow up by email or direct conversation instead. Record useful feedback in the member profile notes.

## 9. Handle failed deliveries

Directory displays recent delivery failures.

1. Read the failure type and error.
2. Check the recipient's email spelling and current account status.
3. Confirm the introduction is still active and authorized.
4. Fix the underlying issue.
5. Use Retry once.

Do not repeatedly retry an SMS failure while carrier approval is pending. Use email.

If an invitation email failed, correct the email before retrying. If the person already passed, blocked the other person, deleted their account, or the introduction closed, the system cancels the delivery instead of sending it.

## 10. Invite another operator

Only a super admin can do this.

1. Open Team.
2. Under `Add an operator`, enter the person's full name, email, and city.
3. Click `Add & invite`.
4. Confirm the success message.

If the invitation email succeeds, the new operator receives a magic sign-in link. If the account is added but the email fails, ask the operator to visit:

`https://hellomutuals.com/studio/login`

They should enter the exact email used in Team.

If the email already belongs to a member, adding the person as an operator promotes the existing account. Their old sessions are cleared so they must sign in again.

To remove an ordinary operator, use `Revoke access` beside their name and confirm. Revocation signs them out and removes Studio access. It does not delete the person's record. Jess cannot revoke herself or another protected super admin from this screen.

## 11. Invite members to an event

1. Open Events.
2. Create the event with a theme, venue, city, date, time, and capacity.
3. Open the event.
4. Under Add invitees, check the active members you want to invite.
5. Click `Add & email selected`.
6. Track each invitee as Invited, Confirmed, Attended, or No-show.

The event invitation email is automatic. Venue booking, payment, seating, dietary follow-up, and calendar coordination are manual operator tasks.

## 12. A practical daily routine

1. Open Directory and review new applicants.
2. Check failed deliveries before sending new work.
3. Open Conversations and handle anything marked Needs attention.
4. Review members who are ready to match.
5. Create introductions from Matchmaking.
6. Follow up on mutual connections manually.
7. Record notes that will improve future matching.
8. Review any upcoming event guest lists.

## Operator safety rules

- Never share an operator magic link or use a shared account.
- Never add someone to matchmaking without their direct permission.
- Never check SMS consent unless the person separately agreed to texts.
- Never use Connect now without explicit yes from both people.
- Never tell one person who passed.
- Never share private Studio notes with a member or proposed match.
- Never depend on SMS while carrier approval is still pending.
- Never claim a venue or date is booked unless a human completed and confirmed it.
- Use Co-pilot carefully. Commands can change live data.

## Quick troubleshooting

### I cannot sign in

Use `/studio/login`, not the member login. Request a fresh link and open it within 15 minutes. A link works once.

### A member is in Directory but not in Matchmaking

They are probably not ready to match. Ask them to sign in at `/login`, open Home, and opt in.

### A person never received an introduction

Check Directory for a failed delivery, confirm the email address, and use Resend after fixing the issue. Do not assume an SMS was delivered.

### The pair appears in Status but received nothing

Status can contain internal suggestions. Create and send the real introduction from Matchmaking.

### Only one person said yes

Wait. Their answer stays private. After three days, use Resend for the pending person if appropriate.

### Both said yes but they are not connected

Check Directory for a connection delivery failure. Fix the email issue and retry. Do not create a duplicate match.

### I need to change a member's details

The member can edit their member profile after signing in. Operators can record internal notes on the Directory profile. If the email itself is wrong and blocks delivery, correct it before retrying any message.
