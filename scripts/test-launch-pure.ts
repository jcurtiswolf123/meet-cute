import assert from "node:assert/strict";
import { bookingUnavailableMessage } from "../src/lib/operator-actions";
import { makeDeliveryKey, retryDelayMs } from "../src/lib/delivery";
import { uploadStorageMode } from "../src/lib/uploads";
import {
  canRevokeOperatorAccess,
  hasOperatorAccess,
  hasSuperAdminAccess,
} from "../src/lib/auth";
import { LIVE_INTRO_STAGES, introReturnPath } from "../src/lib/introductions";
import { introNotice } from "../src/app/studio/(portal)/matchmaking/intro-notice";
import { currentStep, hasFullName, splitName } from "../src/lib/application-steps";

// Storage mode is read from the environment, because the thing that has to be
// true in production is that a photo lands in two places. "database" is a
// single copy and only honest where there are no credentials: local, CI.
{
  const saved = {
    endpoint: process.env.AWS_ENDPOINT_URL_S3,
    bucket: process.env.BUCKET_NAME,
    key: process.env.AWS_ACCESS_KEY_ID,
    secret: process.env.AWS_SECRET_ACCESS_KEY,
  };
  for (const k of ["AWS_ENDPOINT_URL_S3", "BUCKET_NAME", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]) {
    delete process.env[k];
  }
  assert.equal(uploadStorageMode(), "database", "no bucket configured means one copy, and it says so");
  process.env.AWS_ENDPOINT_URL_S3 = "https://fly.storage.tigris.dev";
  process.env.BUCKET_NAME = "mutuals-photos";
  process.env.AWS_ACCESS_KEY_ID = "id";
  process.env.AWS_SECRET_ACCESS_KEY = "secret";
  assert.equal(uploadStorageMode(), "mirrored", "a configured bucket means both copies");
  // A half-configured bucket is the dangerous case: it must not read as mirrored.
  delete process.env.AWS_SECRET_ACCESS_KEY;
  assert.equal(uploadStorageMode(), "database", "incomplete credentials must not claim two copies");
  for (const [k, v] of Object.entries({
    AWS_ENDPOINT_URL_S3: saved.endpoint,
    BUCKET_NAME: saved.bucket,
    AWS_ACCESS_KEY_ID: saved.key,
    AWS_SECRET_ACCESS_KEY: saved.secret,
  })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

const bookingMessage = bookingUnavailableMessage();
assert.match(bookingMessage, /not automated/i);
assert.doesNotMatch(bookingMessage, /\bbooked\b/i);
assert.doesNotMatch(bookingMessage, /calendar invites/i);

assert.equal(retryDelayMs(1), 30_000);
assert.equal(retryDelayMs(2), 60_000);
assert.equal(retryDelayMs(8), 3_600_000);
assert.equal(makeDeliveryKey("intro", "match-1", "a"), makeDeliveryKey("intro", "match-1", "a"));
assert.notEqual(makeDeliveryKey("intro", "match-1", "a"), makeDeliveryKey("intro", "match-1", "b"));

assert.equal(hasOperatorAccess({ isOperator: true, isSuperAdmin: false }), true);
assert.equal(hasOperatorAccess({ isOperator: false, isSuperAdmin: true }), false);
assert.equal(hasSuperAdminAccess({ isOperator: true, isSuperAdmin: true }), true);
assert.equal(hasSuperAdminAccess({ isOperator: true, isSuperAdmin: false }), false);
assert.equal(hasSuperAdminAccess({ isOperator: false, isSuperAdmin: true }), false);
assert.equal(
  canRevokeOperatorAccess(
    { id: "super", isOperator: true, isSuperAdmin: true },
    { id: "operator", isOperator: true, isSuperAdmin: false },
  ),
  true,
);
assert.equal(
  canRevokeOperatorAccess(
    { id: "operator", isOperator: true, isSuperAdmin: false },
    { id: "other", isOperator: true, isSuperAdmin: false },
  ),
  false,
);
assert.equal(
  canRevokeOperatorAccess(
    { id: "super", isOperator: true, isSuperAdmin: true },
    { id: "other-super", isOperator: true, isSuperAdmin: true },
  ),
  false,
);

// Regression: an operator standing on a person profile sent an introduction to
// someone that person already had a match row with, and got the generic
// "Something went sideways." page four times (Sentry 7648555016, actions.ts:1045).
// Two defects, both covered here.

// 1. Only a LIVE invitation blocks a new introduction. "suggested" is the stage
//    BEFORE an introduction and has emailed nobody, so treating it as open made
//    every pair the Status board or the co-pilot had ever suggested permanently
//    un-introducible. "exit" and "connected" are finished and can be re-opened.
assert.equal(LIVE_INTRO_STAGES.includes("invited"), true);
assert.equal(LIVE_INTRO_STAGES.includes("mutual_yes"), true);
assert.equal(LIVE_INTRO_STAGES.includes("connecting"), true);
assert.equal(LIVE_INTRO_STAGES.includes("suggested"), false);
assert.equal(LIVE_INTRO_STAGES.includes("exit"), false);
assert.equal(LIVE_INTRO_STAGES.includes("connected"), false);

// 2. Every outcome has operator-readable copy, so no refusal can reach the error
//    boundary unexplained. Each code the action can emit must resolve.
for (const code of [
  "sent",
  "pick-two",
  "same-person",
  "missing-person",
  "not-approved",
  "no-channel",
  "already-open",
  "blocked",
]) {
  assert.ok(introNotice(code), `no operator copy for intro outcome "${code}"`);
}
assert.equal(introNotice(undefined), undefined);
assert.equal(introNotice("not-a-real-code"), undefined);

// The redirect target comes from a hidden form field, so it must never leave the
// studio. Absolute and protocol-relative values fall back rather than redirect.
assert.equal(introReturnPath("/studio"), "/studio");
assert.equal(introReturnPath("/studio/matchmaking"), "/studio/matchmaking");
assert.equal(introReturnPath("/studio/person/abc123"), "/studio/person/abc123");
assert.equal(introReturnPath("https://evil.example/studio"), "/studio");
assert.equal(introReturnPath("//evil.example"), "/studio");
assert.equal(introReturnPath("/studio/../../app"), "/studio");
assert.equal(introReturnPath("/app"), "/studio");
assert.equal(introReturnPath(""), "/studio");
assert.equal(introReturnPath(undefined), "/studio");
assert.equal(introReturnPath(null), "/studio");

// --- the name step, which is now two required fields in one column ---------
//
// A surname is required, and the form has always stored both halves in one
// `name`. That makes the split the dangerous part: it runs every time the page
// redraws, and it used to drop the last word of a three-part name.
assert.deepEqual(splitName("Mary Anne Smith"), { first: "Mary", last: "Anne Smith" });
assert.deepEqual(splitName("Ada Lovelace"), { first: "Ada", last: "Lovelace" });
assert.deepEqual(splitName("  Ada   Lovelace  "), { first: "Ada", last: "Lovelace" });
assert.deepEqual(splitName("josh"), { first: "josh", last: "" });
assert.deepEqual(splitName(""), { first: "", last: "" });
assert.deepEqual(splitName(null), { first: "", last: "" });
// Round trip: whatever the form shows must be what the row already holds, or
// resuming an application quietly edits somebody's name.
for (const name of ["Mary Anne Smith", "Ada Lovelace", "Jean-Luc de la Cruz"]) {
  const { first, last } = splitName(name);
  assert.equal(`${first} ${last}`, name, `Splitting and rejoining ${name} must be lossless.`);
}

assert.equal(hasFullName("Ada Lovelace"), true);
assert.equal(hasFullName("Mary Anne Smith"), true);
// The name a row carries after sign-in is the email local part. It looks like
// an answer and is not one, which is how somebody reached the friends page
// having never typed their own name.
assert.equal(hasFullName("josh"), false);
assert.equal(hasFullName("  josh  "), false);
assert.equal(hasFullName(""), false);
assert.equal(hasFullName(null), false);

// A half-answered name sends them back to the first step and leaves everything
// else they answered alone.
const seeded = {
  name: "josh",
  city: "SF",
  gender: "man",
  birthdate: new Date("1990-01-01"),
  agreedTosAt: null,
  basicsAt: null,
  applicationStep: "gender" as const,
};
assert.equal(currentStep(seeded, 1), "name");
assert.equal(currentStep({ ...seeded, name: "Josh Wolf" }, 1), "extras");
// Anyone already through the first half is left alone: requiring a surname
// today is not a reason to stop someone who answered that screen yesterday.
assert.equal(currentStep({ ...seeded, basicsAt: new Date() }, 1), "extras");

console.log("launch pure checks passed");
