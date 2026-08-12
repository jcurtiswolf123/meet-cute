# mutuals : why the studio was slow, and what it costs now

_Measured 2026-08-11 against a production build. Numbers below are database
round trips per page, not milliseconds, because milliseconds on a laptop mean
nothing here and round trips transfer exactly._

## The one fact everything follows from

The app runs on Fly in `sjc`. Every row lives in Neon in `us-east-2`. A warm
query round trip between them is **about 50ms**, measured, and a cold connection
is closer to 500ms.

Nothing in this product is slow because of how much data it holds. On 11 August
production had 98 people, 29 of them active, 242 photos and 1 match. Every page
in the studio was slow because it asked a database on the other side of the
country a great many separate questions and waited for each answer in turn.

So the unit of work is a round trip, and the two ways to make a page faster are
to ask fewer questions and to ask them at the same time.

## What each page cost, before and after

Both columns were measured the same way, on a warm production build of this
repository, against the same sandbox database: the branch reverted, built and
counted, then the branch restored, rebuilt and counted again.

| Page | Before | After |
|---|---|---|
| `/studio/person/[id]` | 29 | 13 |
| `/studio` (directory) | 19 | 9 |
| `/studio/matchmaking` | 12 | 5 |
| `/studio/matches` | 12 | 3 |
| `/studio/pipeline` | 11 | 3 |
| `/studio/conversations` | 10 | 4 |
| `/studio/team` | 6 | 2 |
| `/studio/delivery` | 5 | 2 |
| `/studio/events` | 5 | 2 |
| `/studio/venues` | 5 | 2 |
| **All ten** | **114** | **45** |

At the measured 50ms that is about 5.7 seconds of waiting across the studio,
down to about 2.2.

Count is only half of it. What an operator waits for is the **longest chain of
queries that have to happen one after another**, and that is what fell hardest:
the directory was about thirteen round trips deep and is now two, because
authentication is one query and everything after it is issued at once.

Reproduce with `PRISMA_LOG_QUERIES=1` on the server and count `prisma-query`
lines around one request. A background delivery worker also uses the database,
so filter its `DeliveryJob` traffic out before counting.

## What was actually wrong

**Authorization cost eight round trips before a page read anything.** Finding
out whether the visitor was an operator meant reading the session row, then the
person, then that person's photos, then their prompts. Four trips. Next renders
a layout and its page concurrently and both called it, so it was eight, and the
studio spent roughly four tenths of a second deciding whether to let somebody in
before it started on what they came for. It is now one query: the person rides
along on the session row through a join, only the columns an authorization
decision reads, and React's `cache` makes the layout and the page share one
answer. `getSessionSubject` in `src/lib/auth.ts`.

**Opening a profile called an embeddings API, in the render, behind a 12-second
timeout.** `candidatesFor` embedded the person on the spot whenever their vector
had not been stored. Not one active member in production had a stored vector, so
this happened on every profile an operator opened. Measured at 250-350ms when
the provider is healthy; the ceiling is twelve seconds, after which the page
renders the same thing anyway. A page render now never calls a third party: the
stored vector is used when it exists and a deterministic local fallback stands
in when it does not. `npm run embed` backfills the real ones, which is where the
call belongs.

**Every `include` was its own round trip.** Prisma resolves relations with
follow-up queries by default, so the directory spent five trips assembling one
list: the people, then their photos, then their referrers, then both sides of
their matches. The `relationJoins` preview feature is on, and the studio's list
queries ask for `relationLoadStrategy: "join"`, which resolves them in one
statement with a LATERAL JOIN.

**The connection pool had three lanes.** Prisma sizes it `cpus * 2 + 1` and a
`shared-cpu-1x` machine reports one CPU. The directory issues nine queries at
once precisely so it waits 50ms instead of 450, and six of them queued anyway.
Now 12, set on the URL in `src/lib/prisma.ts` so it travels with the code.

**Avatars were the hidden half of the directory.** Each one is a separate
authenticated request to `/api/photos/[file]`, and each did the four-trip
authorization above plus two more for the photo, so a roster of 29 members
meant about 170 cross-region round trips in images alone, six at a time through
the browser's connection limit. Authorization there is now one query, the photo
is one, and an approved photo is cacheable by the browser for a day instead of
an hour, so the operator who keeps the studio open all day fetches each face
once.

**Queries read whole rows to count them or to take one.** The directory pulled
every match row a member had ever been in, on both relations, to find the date
of the most recent one. The pipeline pulled both people in full, with every
photo they had ever uploaded, to draw two 28px avatars. `candidatesFor` pulled
every vouch row to take its length.

**Nine relation columns had no index.** Prisma does not create one for a
relation column on PostgreSQL. `Photo.personId`, `Prompt.personId`,
`Match.personBId`, `Match.stage`, `Vouch.subjectId`, `Note.subjectId`,
`Note.matchId`, `DinnerAttendee.personId` and `Person.status` are all read on
every page load and all were sequential scans. At 98 rows this is invisible and
it stays invisible right up until it is not, so
`prisma/migrations/20260811_studio_hot_path_indexes` adds them, concurrently.

## The step that is not done

**Move the app to `iad`.** This is the largest single remaining win and the only
one that needs no code: from `iad` the round trip to Neon is roughly 12ms rather
than 50, so every number in the table above gets about four times cheaper. A
visitor in California pays about 50ms more to reach the app and gets it back
several times over on a page that asks the database anything at all.

`fly.toml` already says `primary_region = "iad"`, which only governs where new
machines are created. The two live machines have to be moved deliberately:

```
fly scale count 2 --region iad -a meet-cute   # bring up the pair in iad
fly scale count 0 --region sjc -a meet-cute   # retire the sjc pair
```

In that order there is no window with fewer than two machines.

Blocked on 11 August 2026 because the stored Fly token no longer verifies
(`missing third-party discharge token`). `flyctl auth login` first.

The index migration also still has to be applied: `npm run db:deploy`.

## Rules worth keeping

- A page render never calls a third party. If a page needs a model's output,
  the output is computed offline and stored.
- Queries a page needs at the same time are issued at the same time. A bare
  `await` followed by another bare `await` is 50ms that nobody asked for.
- Read the columns that get drawn. `include: { photos: true }` to render one
  avatar sends every photo row over the wire.
- Count with `_count`, take the newest with `take: 1`. Do not fetch a list to
  measure it.
- Authorization reads what authorization decides on, and nothing else.
