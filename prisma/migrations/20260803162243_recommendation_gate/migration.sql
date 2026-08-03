-- Recommendations an applicant's friends write about them.
--
-- Additive only. Nothing is dropped, no existing row changes, and no member who
-- is already accepted is re-gated: acceptance still reads acceptedAt/status,
-- which this migration does not touch. Applicants who applied BEFORE it and are
-- still waiting have no recommendation rows, so they are accepted the way they
-- always were, by an operator on the Studio profile.
--
-- Person.voucherName / voucherContact / recommendation stay exactly as they are.
-- They now hold a copy of the first recommendation a friend actually wrote,
-- rather than what the applicant guessed their friend would say.

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "body" TEXT,
    "relationship" TEXT,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_token_key" ON "Recommendation"("token");

-- CreateIndex
CREATE INDEX "Recommendation_applicantId_status_idx" ON "Recommendation"("applicantId", "status");

-- CreateIndex
CREATE INDEX "Recommendation_token_idx" ON "Recommendation"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_applicantId_email_key" ON "Recommendation"("applicantId", "email");

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
