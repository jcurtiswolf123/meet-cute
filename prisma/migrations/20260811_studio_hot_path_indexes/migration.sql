-- Indexes for the columns the operator studio filters on every page load.
--
-- Prisma does not create an index for a relation column on PostgreSQL, so each
-- of these was a sequential scan. The tables are small enough today that the
-- scans are cheap; they are here because the query shapes are permanent and the
-- cliff is not visible until it has already been hit.
--
-- Deliberately NOT concurrent. `prisma migrate` runs each migration inside a
-- transaction and honours no directive to opt out, and Postgres refuses
-- CREATE INDEX CONCURRENTLY inside one (error 25001). Plain CREATE INDEX takes
-- an ACCESS EXCLUSIVE lock, which is the right trade here and only here: on
-- 2026-08-11 the largest of these tables held 242 rows, so every one of these
-- builds in single-digit milliseconds. If any of them reaches a size where that
-- lock is a real outage, split this into statements run by hand against the
-- database with CONCURRENTLY, then `prisma migrate resolve --applied`.

-- Roster reads: every studio list filters the people table by status.
CREATE INDEX IF NOT EXISTS "Person_status_idx" ON "meetcute"."Person"("status");

-- Avatars and galleries: read by person on the directory, the pipeline, the
-- matchmaking board, the matches history, and every profile.
CREATE INDEX IF NOT EXISTS "Photo_personId_idx" ON "meetcute"."Photo"("personId");
CREATE INDEX IF NOT EXISTS "Prompt_personId_idx" ON "meetcute"."Prompt"("personId");

-- Match: personAId is already the leading column of the (personAId, personBId)
-- unique index, so it is covered and personBId is not. Every profile reads both
-- sides, and the pipeline, conversations, and matchmaking boards filter by stage.
CREATE INDEX IF NOT EXISTS "Match_personBId_idx" ON "meetcute"."Match"("personBId");
CREATE INDEX IF NOT EXISTS "Match_stage_idx" ON "meetcute"."Match"("stage");

-- Vouch: subjectId is the second column of the (voucherId, subjectId) unique,
-- so "who vouched for this person" could not use it.
CREATE INDEX IF NOT EXISTS "Vouch_subjectId_idx" ON "meetcute"."Vouch"("subjectId");

-- Notes: read by subject on every profile, by match on every conversation.
CREATE INDEX IF NOT EXISTS "Note_subjectId_idx" ON "meetcute"."Note"("subjectId");
CREATE INDEX IF NOT EXISTS "Note_matchId_idx" ON "meetcute"."Note"("matchId");

-- Dinner co-attendance, which is one third of the social graph on a profile.
CREATE INDEX IF NOT EXISTS "DinnerAttendee_personId_idx" ON "meetcute"."DinnerAttendee"("personId");
