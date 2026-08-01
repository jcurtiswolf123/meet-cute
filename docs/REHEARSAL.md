# Rehearsing the whole flow with Jess

How to walk an introduction end to end on the live site, with Jess running the
Studio and two member accounts you control. About fifteen minutes.

`docs/OPERATOR-GUIDE.md` is the guide for Jess herself. This is the setup and
the reset around it.

## What you already have

Nothing needs creating. All three accounts exist in production:

| Role | Account | Notes |
|---|---|---|
| Operator | `jesswolflord@gmail.com` | Jess, super admin, can also manage the team |
| Member A | `jessicaraquelwolf@gmail.com` | Jess's own member account, separate from her operator login |
| Member B | `admin@shiftsupportnetwork.com` | Josh's member account |

Jess having two accounts is deliberate and worth keeping. She signs into the
Studio with one and experiences the member side with the other, in a different
browser profile, which is the only way to see what a member actually receives.

## Why a rehearsal can feel broken when nothing is

The introduction email and the decision page both render **the other person**.
As of 2026-07-28 both member profiles were empty: no headline, no bio, no photo.
The flow ran correctly, the invites were sent and confirmed delivered, and there
was simply nothing on screen to react to, so nobody clicked.

Check before you start:

```bash
cd ~/Projects/meet-cute
node --env-file=.env --import tsx scripts/rehearsal.ts status
```

It prints each account, what its profile is missing, the current introduction
stage, and, for every email already sent, what the provider says actually
happened to it (`delivered`, `bounced`, `complained`). Wanting a profile
complete is the point: `MISSING: headline, bio, photo` means stop and fix that
first.

## Setup

Fill only the empty fields, and never overwrite anything a member wrote:

```bash
node --env-file=.env --import tsx scripts/rehearsal.ts profiles          # dry run
node --env-file=.env --import tsx scripts/rehearsal.ts profiles --yes    # apply
```

This sets a placeholder headline, bio, and photo where those are blank, marks
both accounts `active`, and opts them into matching. The placeholders are
labelled as placeholders and the photo is initials on a cream field, not a stock
portrait, so rehearsal data is never mistaken for a real member.

Better, and part of what you are testing: sign in as each member and write the
real profile through the member app. The placeholders exist so a rehearsal is
never blocked on it.

Clear any previous introduction between the two so you start from nothing:

```bash
node --env-file=.env --import tsx scripts/rehearsal.ts reset --yes
```

That deletes only introductions between those two accounts. Profiles, photos,
and the accounts themselves are untouched.

## Sign-in links

Magic links normally go to the inbox. To skip that, or to sign in as an account
whose mail you cannot read:

```bash
node --env-file=.env --import tsx scripts/rehearsal.ts links
```

Prints one single-use link per account, valid fifteen minutes, each pointed at
the right destination (`/studio` for Jess, `/app` for members). **Open each in a
separate browser profile or incognito window.** One browser cannot hold three
sessions, and signing in as the second account silently replaces the first.

For a fully realistic run, have Jess request her own link at
`https://hellomutuals.com/studio/login` instead. That also tests magic-link
delivery to a real Gmail account.

## The walkthrough

**1. Jess signs into the Studio.** `https://hellomutuals.com/studio`

**2. She confirms both people are ready.** Directory, then each person. Status
`active` and open to matching.

**3. She sends the introduction.** Matchmaking, pick the two, write the
rationale in her own words (it is shown to nobody but her, and it is the part
worth practising), send.

Mutuals mints one invite per person and queues an email to each. Watch the
Delivery log in the Studio: both jobs should reach `sent` within seconds. If one
fails it stays visible with a Retry action rather than disappearing.

**4. Each member decides.** Two ways, both real, worth trying one of each:

- Open the email and click **Yes** or **Pass**. That is the `/i/<token>` page,
  which shows the other person's profile.
- Reply to the email with `Y` or `N`. The `Reply-To` carries the invite token,
  so a plain reply is read as the decision. Greetings, quoted history,
  signatures, and bottom-posted replies are all handled. Anything ambiguous is
  deliberately ignored, leaving the introduction pending with the buttons still
  live, rather than guessing.

**5. Both said yes.** Mutuals sends one joint email introducing them to each
other, and the introduction moves to `connected`. Confirm:

```bash
node --env-file=.env --import tsx scripts/rehearsal.ts status
```

Expect `stage=connected`, `connectedAt` set, and a
`connection_email_thread` job `sent`.

**6. If one passed**, the introduction closes and the other person is never told
who passed. Confirm the stage is `exit`.

## Doing it again

```bash
node --env-file=.env --import tsx scripts/rehearsal.ts reset --yes
```

Then go back to step 3. Profiles persist, so setup is a one-time cost.

## Worth knowing

- **Check the spam folder.** The invites are confirmed `delivered` at the
  provider, but Gmail has been filing them to Spam. The message itself scores
  9.3/10 on mail-tester with clean authentication; the open item is that
  `hellomutuals.com` publishes no MX record. See `docs/STATUS.md`.
- **Email is the production channel.** SMS is not carrier-approved. Do not
  rehearse anything that depends on a text landing.
- **Venue booking and calendar coordination are manual.** Nothing books a table.
- **Do not rehearse against a real member.** These scripts default to the three
  accounts above and touch nothing else, but `REHEARSAL_A` and `REHEARSAL_B` will
  point them anywhere, so set those deliberately.
- **Automated coverage** of this same path, including the reply parsing, is in
  `docs/EMAIL-TESTING.md`. Run that before rehearsing, not instead of it.
