-- Separate ordinary studio access from authority to manage operator accounts.
ALTER TABLE "Person"
ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Bootstrap the requested production super admin without touching other data.
-- The fixed id is used only when the account does not already exist.
INSERT INTO "Person" (
  "id",
  "updatedAt",
  "name",
  "email",
  "city",
  "isOperator",
  "isSuperAdmin",
  "status",
  "headline"
)
VALUES (
  'meet_cute_super_admin_jess',
  CURRENT_TIMESTAMP,
  'Jessica Wolflord',
  'jesswolflord@gmail.com',
  'NYC',
  true,
  true,
  'active',
  'Matchmaker'
)
ON CONFLICT ("email") DO UPDATE
SET
  "isOperator" = true,
  "isSuperAdmin" = true,
  "status" = 'active',
  "updatedAt" = CURRENT_TIMESTAMP;

-- A privilege increase always requires a fresh magic-link login.
DELETE FROM "Session"
WHERE "personId" = (
  SELECT "id" FROM "Person" WHERE "email" = 'jesswolflord@gmail.com'
);

DELETE FROM "LoginToken"
WHERE "email" = 'jesswolflord@gmail.com';

-- A super admin must always retain ordinary operator access.
ALTER TABLE "Person"
ADD CONSTRAINT "Person_super_admin_requires_operator"
CHECK (NOT "isSuperAdmin" OR "isOperator");
