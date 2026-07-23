-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "meetcute";

-- CreateTable
CREATE TABLE "meetcute"."Block" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetcute"."CoachingEngagement" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "partnerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "CoachingEngagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetcute"."ConciergeMessage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "threadId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "toPersonId" TEXT,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'text',

    CONSTRAINT "ConciergeMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetcute"."ConciergeThread" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "matchId" TEXT NOT NULL,
    "venueId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'proposing',
    "round" INTEGER NOT NULL DEFAULT 1,
    "proposedSlots" TEXT,
    "aPick" TEXT,
    "bPick" TEXT,
    "confirmedSlot" TIMESTAMP(3),
    "holdsUntil" TIMESTAMP(3),
    "lastNudgeAt" TIMESTAMP(3),

    CONSTRAINT "ConciergeThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetcute"."Dinner" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "venue" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 12,
    "theme" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "notes" TEXT,

    CONSTRAINT "Dinner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetcute"."DinnerAttendee" (
    "id" TEXT NOT NULL,
    "dinnerId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'invited',

    CONSTRAINT "DinnerAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetcute"."IntroMessage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchId" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'out',
    "author" TEXT NOT NULL DEFAULT 'bot',
    "personId" TEXT,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'text',

    CONSTRAINT "IntroMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetcute"."LoginToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "LoginToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetcute"."Match" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "personAId" TEXT NOT NULL,
    "personBId" TEXT NOT NULL,
    "createdById" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'suggested',
    "aDecision" TEXT NOT NULL DEFAULT 'pending',
    "bDecision" TEXT NOT NULL DEFAULT 'pending',
    "rationale" TEXT,
    "lastActorId" TEXT,
    "stalledReason" TEXT,
    "exitReason" TEXT,
    "connectedAt" TIMESTAMP(3),
    "notifiedAAt" TIMESTAMP(3),
    "notifiedBAt" TIMESTAMP(3),
    "followUpAt" TIMESTAMP(3),
    "aboutPersonA" TEXT,
    "aboutPersonB" TEXT,
    "conversationSid" TEXT,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetcute"."MatchInvite" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "sentAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "MatchInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetcute"."Note" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subjectId" TEXT NOT NULL,
    "authorId" TEXT,
    "matchId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'general',
    "body" TEXT NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetcute"."Person" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT NOT NULL,
    "isOperator" BOOLEAN NOT NULL DEFAULT false,
    "isAmbassador" BOOLEAN NOT NULL DEFAULT false,
    "isCoach" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'applicant',
    "headline" TEXT,
    "bio" TEXT,
    "lookingFor" TEXT,
    "dealBreakers" TEXT,
    "gender" TEXT,
    "seeking" TEXT,
    "age" INTEGER,
    "neighborhood" TEXT,
    "birthdate" TIMESTAMP(3),
    "agreedTosAt" TIMESTAMP(3),
    "ambassadorTitle" TEXT,
    "ambassadorSince" TIMESTAMP(3),
    "coachBio" TEXT,
    "appliedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "fastTracked" BOOLEAN NOT NULL DEFAULT false,
    "embedding" TEXT,
    "referredById" TEXT,
    "openToMatch" BOOLEAN NOT NULL DEFAULT false,
    "optedInAt" TIMESTAMP(3),
    "instagram" TEXT,
    "linkedin" TEXT,
    "recommendation" TEXT,
    "voucherContact" TEXT,
    "voucherName" TEXT,
    "smsConsentAt" TIMESTAMP(3),

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetcute"."Photo" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "storageUrl" TEXT,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetcute"."Prompt" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Prompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetcute"."Reference" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "friendId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "reply" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "repliedAt" TIMESTAMP(3),

    CONSTRAINT "Reference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetcute"."Referral" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "inviteeEmail" TEXT,
    "inviteeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "fastTrack" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetcute"."Report" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reporterId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetcute"."Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetcute"."Venue" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "area" TEXT,
    "notes" TEXT,
    "partner" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetcute"."VenueSlot" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "time" TEXT NOT NULL,
    "held" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "VenueSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetcute"."Vouch" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voucherId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "Vouch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Block_blockedId_idx" ON "meetcute"."Block"("blockedId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Block_blockerId_blockedId_key" ON "meetcute"."Block"("blockerId" ASC, "blockedId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ConciergeThread_matchId_key" ON "meetcute"."ConciergeThread"("matchId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DinnerAttendee_dinnerId_personId_key" ON "meetcute"."DinnerAttendee"("dinnerId" ASC, "personId" ASC);

-- CreateIndex
CREATE INDEX "IntroMessage_createdAt_idx" ON "meetcute"."IntroMessage"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "IntroMessage_matchId_idx" ON "meetcute"."IntroMessage"("matchId" ASC);

-- CreateIndex
CREATE INDEX "LoginToken_email_idx" ON "meetcute"."LoginToken"("email" ASC);

-- CreateIndex
CREATE INDEX "LoginToken_expiresAt_idx" ON "meetcute"."LoginToken"("expiresAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "LoginToken_tokenHash_key" ON "meetcute"."LoginToken"("tokenHash" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Match_personAId_personBId_key" ON "meetcute"."Match"("personAId" ASC, "personBId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "MatchInvite_matchId_personId_key" ON "meetcute"."MatchInvite"("matchId" ASC, "personId" ASC);

-- CreateIndex
CREATE INDEX "MatchInvite_token_idx" ON "meetcute"."MatchInvite"("token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "MatchInvite_token_key" ON "meetcute"."MatchInvite"("token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Person_email_key" ON "meetcute"."Person"("email" ASC);

-- CreateIndex
CREATE INDEX "Person_phone_idx" ON "meetcute"."Person"("phone" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Referral_code_key" ON "meetcute"."Referral"("code" ASC);

-- CreateIndex
CREATE INDEX "Report_status_idx" ON "meetcute"."Report"("status" ASC);

-- CreateIndex
CREATE INDEX "Report_subjectId_idx" ON "meetcute"."Report"("subjectId" ASC);

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "meetcute"."Session"("expiresAt" ASC);

-- CreateIndex
CREATE INDEX "Session_personId_idx" ON "meetcute"."Session"("personId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "meetcute"."Session"("tokenHash" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Vouch_voucherId_subjectId_key" ON "meetcute"."Vouch"("voucherId" ASC, "subjectId" ASC);

-- AddForeignKey
ALTER TABLE "meetcute"."Block" ADD CONSTRAINT "Block_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "meetcute"."Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetcute"."Block" ADD CONSTRAINT "Block_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "meetcute"."Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetcute"."CoachingEngagement" ADD CONSTRAINT "CoachingEngagement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "meetcute"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetcute"."CoachingEngagement" ADD CONSTRAINT "CoachingEngagement_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "meetcute"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetcute"."ConciergeMessage" ADD CONSTRAINT "ConciergeMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "meetcute"."ConciergeThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetcute"."ConciergeThread" ADD CONSTRAINT "ConciergeThread_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "meetcute"."Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetcute"."ConciergeThread" ADD CONSTRAINT "ConciergeThread_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "meetcute"."Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetcute"."DinnerAttendee" ADD CONSTRAINT "DinnerAttendee_dinnerId_fkey" FOREIGN KEY ("dinnerId") REFERENCES "meetcute"."Dinner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetcute"."DinnerAttendee" ADD CONSTRAINT "DinnerAttendee_personId_fkey" FOREIGN KEY ("personId") REFERENCES "meetcute"."Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetcute"."IntroMessage" ADD CONSTRAINT "IntroMessage_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "meetcute"."Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetcute"."Match" ADD CONSTRAINT "Match_personAId_fkey" FOREIGN KEY ("personAId") REFERENCES "meetcute"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetcute"."Match" ADD CONSTRAINT "Match_personBId_fkey" FOREIGN KEY ("personBId") REFERENCES "meetcute"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetcute"."MatchInvite" ADD CONSTRAINT "MatchInvite_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "meetcute"."Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetcute"."Note" ADD CONSTRAINT "Note_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "meetcute"."Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetcute"."Note" ADD CONSTRAINT "Note_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "meetcute"."Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetcute"."Note" ADD CONSTRAINT "Note_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "meetcute"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetcute"."Person" ADD CONSTRAINT "Person_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "meetcute"."Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetcute"."Photo" ADD CONSTRAINT "Photo_personId_fkey" FOREIGN KEY ("personId") REFERENCES "meetcute"."Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetcute"."Prompt" ADD CONSTRAINT "Prompt_personId_fkey" FOREIGN KEY ("personId") REFERENCES "meetcute"."Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetcute"."Reference" ADD CONSTRAINT "Reference_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "meetcute"."Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetcute"."Referral" ADD CONSTRAINT "Referral_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "meetcute"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetcute"."Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "meetcute"."Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetcute"."Report" ADD CONSTRAINT "Report_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "meetcute"."Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetcute"."Session" ADD CONSTRAINT "Session_personId_fkey" FOREIGN KEY ("personId") REFERENCES "meetcute"."Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetcute"."VenueSlot" ADD CONSTRAINT "VenueSlot_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "meetcute"."Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetcute"."Vouch" ADD CONSTRAINT "Vouch_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "meetcute"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetcute"."Vouch" ADD CONSTRAINT "Vouch_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "meetcute"."Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
