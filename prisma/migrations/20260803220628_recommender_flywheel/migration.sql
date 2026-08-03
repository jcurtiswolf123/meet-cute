-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "acceptOverrideReason" TEXT,
ADD COLUMN     "acceptedById" TEXT;

-- AlterTable
ALTER TABLE "Recommendation" ADD COLUMN     "convertedAt" TIMESTAMP(3),
ADD COLUMN     "convertedPersonId" TEXT;

-- CreateIndex
CREATE INDEX "Recommendation_email_status_idx" ON "Recommendation"("email", "status");
