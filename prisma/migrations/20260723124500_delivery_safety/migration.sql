-- Add a fencing token so a recovered worker cannot finalize another worker's claim.
ALTER TABLE "DeliveryJob" ADD COLUMN "leaseToken" TEXT;

-- Make account deletion remove queued work for that member.
ALTER TABLE "DeliveryJob"
ADD CONSTRAINT "DeliveryJob_personId_fkey"
FOREIGN KEY ("personId") REFERENCES "Person"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Support bounded stale-lease recovery without scanning the entire queue.
CREATE INDEX "DeliveryJob_status_lockedAt_idx"
ON "DeliveryJob"("status", "lockedAt");
