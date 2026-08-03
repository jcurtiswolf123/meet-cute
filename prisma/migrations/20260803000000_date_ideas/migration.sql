-- Date ideas in the connection email: give a Venue enough detail to actually
-- send two people somewhere, gate it on freshness, and record which one they
-- chose. Purely additive: no column is dropped and no existing row is rewritten.

-- What a suggestion needs to be actionable. A name and a neighbourhood are not
-- enough: the email offers a booking link, and the pick page names the street.
ALTER TABLE "Venue" ADD COLUMN "address" TEXT;
ALTER TABLE "Venue" ADD COLUMN "bookingUrl" TEXT;
ALTER TABLE "Venue" ADD COLUMN "mapsUrl" TEXT;
ALTER TABLE "Venue" ADD COLUMN "cuisine" TEXT;
ALTER TABLE "Venue" ADD COLUMN "priceBand" TEXT;
ALTER TABLE "Venue" ADD COLUMN "goodFor" TEXT;

-- Eligibility is opt-in and expires. A restaurant that closed is worse than no
-- suggestion, so a venue is only ever shown while it is active AND was verified
-- recently. lastVerifiedAt stays NULL here on purpose: nothing has been checked
-- yet, so nothing is eligible until scripts/verify-venues.ts stamps it. That
-- means this migration ships the feature switched off rather than emailing four
-- unverified seed rows to real members.
ALTER TABLE "Venue" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Venue" ADD COLUMN "lastVerifiedAt" TIMESTAMP(3);

-- The shortlist query is city plus active.
CREATE INDEX "Venue_city_active_idx" ON "Venue"("city", "active");

-- "partner" defaulted to true when the table was seeded, which was never
-- accurate: Mutuals holds no standing tables anywhere. New rows default to
-- false. Existing rows are deliberately left alone so this migration cannot
-- change what an operator already sees; the flag is only a ranking hint and is
-- never rendered as copy.
ALTER TABLE "Venue" ALTER COLUMN "partner" SET DEFAULT false;

-- Which venue a matched pair said they were going to, written from the
-- token-gated link in the connection email so neither person needs a session.
-- A record of stated intent, NOT a reservation.
CREATE TABLE "DatePick" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "personId" TEXT,

    CONSTRAINT "DatePick_pkey" PRIMARY KEY ("id")
);

-- Tapping the same suggestion twice is a double-click, not a second decision.
CREATE UNIQUE INDEX "DatePick_matchId_venueId_key" ON "DatePick"("matchId", "venueId");
CREATE INDEX "DatePick_matchId_idx" ON "DatePick"("matchId");

-- Both parents cascade: a pruned match or a removed venue should not leave a
-- pick behind pointing at nothing.
ALTER TABLE "DatePick"
ADD CONSTRAINT "DatePick_matchId_fkey"
FOREIGN KEY ("matchId") REFERENCES "Match"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DatePick"
ADD CONSTRAINT "DatePick_venueId_fkey"
FOREIGN KEY ("venueId") REFERENCES "Venue"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
