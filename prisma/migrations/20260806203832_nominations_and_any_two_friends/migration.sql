-- AlterTable
ALTER TABLE "Recommendation" ALTER COLUMN "gender" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Nomination" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "token" TEXT NOT NULL,
    "nominatorName" TEXT NOT NULL,
    "nominatorEmail" TEXT NOT NULL,
    "nominatorPersonId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "invitedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "personId" TEXT,

    CONSTRAINT "Nomination_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Nomination_token_key" ON "Nomination"("token");

-- CreateIndex
CREATE INDEX "Nomination_email_status_idx" ON "Nomination"("email", "status");

-- CreateIndex
CREATE INDEX "Nomination_token_idx" ON "Nomination"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Nomination_email_nominatorEmail_key" ON "Nomination"("email", "nominatorEmail");

-- AddForeignKey
ALTER TABLE "Nomination" ADD CONSTRAINT "Nomination_nominatorPersonId_fkey" FOREIGN KEY ("nominatorPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nomination" ADD CONSTRAINT "Nomination_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
