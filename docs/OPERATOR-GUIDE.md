# Meet Cute Matchmaker Guide

For operators running the roster. Last updated 2026-07-23.

## What Meet Cute is

Meet Cute is a curated matchmaking service for NYC and SF. Members apply, an
operator reviews them, and the operator introduces one person at a time. Both
members opt in privately. After a mutual yes, the app opens a connection and
the operator coordinates the first date manually.

## Sign in

1. Go to `https://hellomeetcute.com/login`.
2. Enter your operator email.
3. Use the single-use magic link sent to that inbox.

Production has no demo picker or studio passphrase flow.

## Studio sections

- Roster: search and review members, applicant status, profile, history, notes,
  vouches, and social graph.
- Pipeline: review each introduction and its current stage.
- Moderation: approve or reject member photos and resolve safety reports.
- Co-pilot: ask roster questions, create suggestions, add notes, create dinners,
  invite attendees, approve photos, or close introductions.
- Team: add or revoke operator access.

The co-pilot does not reserve a venue or send a calendar invitation. A booking
request returns a manual-coordination reminder.

## Delivery failures

The Studio home page shows the total failed-delivery count and the ten most
recent failures. Each row identifies the masked recipient, related person or
match, attempts, time, failure type, and error.

Use Retry only after correcting the underlying address, consent, or provider
issue. Retry rechecks current account, consent, block, match, and token state. If
the work is no longer authorized, it is cancelled instead of sent.

## Member experience

- One curated introduction is visible at a time.
- Members privately choose yes or pass.
- On a mutual yes, authorized contact information is shared.
- Member phone numbers are not disclosed to another member by the connection
  delivery flow.
- Photos remain private until approved.
- Members can report, block, export their data, or delete their account.

## Daily routine

1. Clear the photo and safety moderation queues.
2. Review and approve appropriate new applicants.
3. Check delivery failures and resolve their causes.
4. Create and review curated introductions.
5. Coordinate fresh mutual connections manually.
6. Record relevant notes after member conversations.
