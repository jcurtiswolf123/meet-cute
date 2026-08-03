-- Photos are live on upload. Remove the pre-publication review gate.
--
-- Uploads landed as "pending" and every surface that renders a photo filters on
-- "approved", so a photo was invisible until an operator approved it. The queue
-- was worked almost never: at the time of this migration 38 of 43 real member
-- photos were pending, which is why introductions kept going out with initials
-- instead of a face. The gate was costing more than it caught.
--
-- Release the backlog. Anything an operator explicitly rejected stays rejected:
-- that was a real decision and this migration must not silently undo it.
UPDATE "Photo" SET "status" = 'approved' WHERE "status" = 'pending';

-- New uploads are approved by the application (src/app/api/photos/route.ts).
-- The default follows so a row inserted by any other path is visible too,
-- rather than silently disappearing the way pending rows used to.
ALTER TABLE "Photo" ALTER COLUMN "status" SET DEFAULT 'approved';

-- The column itself stays, and so does the "approved" filter on every read.
-- That is what still lets an operator hide a reported or plainly wrong photo
-- after the fact (hidePhoto in src/lib/actions.ts, or "hide photos for <name>"
-- at the co-pilot). What is gone is the queue, not the ability to take a photo
-- down.
