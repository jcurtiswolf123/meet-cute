// Render tests for the transactional lifecycle + intake emails.
//
// These are pure template functions, so we can assert on real copy, subjects,
// and that every message rides the shared Meet Cute brand shell (one restrained
// look, no stray palettes). Guards against a template throwing at runtime or
// drifting off-brand. No database or mail provider needed.
import assert from "node:assert/strict";
import {
  applicationReceivedEmail,
  applicationApprovedEmail,
  matchReminderEmail,
  matchFeedbackEmail,
  operatorLeadEmail,
  requestReceivedEmail,
  connectionEmail,
  matchInviteEmail,
  matchThreadEmail,
  eventInviteEmail,
} from "../src/lib/email";

// The one brand shell every transactional email should share. If a template
// stops using these tokens it has drifted off the redesigned look.
const BRAND_INK = "#171714";
const BRAND_CREAM = "#f4f1ea";
// Retired warm-coral palette from the pre-redesign emails. No template should
// ship these anymore.
const RETIRED = ["#d76a45", "#7a1f2b"];

type Msg = { subject: string; html: string; text: string };

function assertWellFormed(label: string, msg: Msg) {
  assert.ok(msg.subject.trim().length > 0, `${label}: empty subject`);
  assert.ok(msg.html.includes("<"), `${label}: html not markup`);
  assert.ok(msg.text.trim().length > 0, `${label}: empty text`);
  // No unresolved template holes or accidental "undefined"/"null" in copy.
  for (const bad of ["undefined", "null", "NaN", "[object Object]"]) {
    assert.ok(!msg.text.includes(bad), `${label}: text contains "${bad}"`);
    assert.ok(!msg.subject.includes(bad), `${label}: subject contains "${bad}"`);
  }
}

function assertOnBrand(label: string, msg: Msg) {
  assert.ok(msg.html.includes(BRAND_INK), `${label}: missing brand ink`);
  assert.ok(msg.html.includes(BRAND_CREAM), `${label}: missing brand cream canvas`);
  assert.ok(msg.html.includes("Meet"), `${label}: missing wordmark`);
  for (const hex of RETIRED) {
    assert.ok(!msg.html.includes(hex), `${label}: still uses retired palette ${hex}`);
  }
}

function main() {
  // 1. Application received (on submit).
  const received = applicationReceivedEmail({ name: "Maya Rosen", city: "NYC" });
  assertWellFormed("applicationReceived", received);
  assertOnBrand("applicationReceived", received);
  assert.match(received.subject, /application/i);
  assert.match(received.html, /New York/);
  // Name with no city must still render cleanly.
  assertWellFormed("applicationReceived(noCity)", applicationReceivedEmail({ name: "Alex" }));

  // 2. Application approved (operator approves -> "you're in").
  const approved = applicationApprovedEmail({
    name: "Alex Chen",
    appUrl: "https://hellomeetcute.com/apply",
  });
  assertWellFormed("applicationApproved", approved);
  assertOnBrand("applicationApproved", approved);
  assert.match(approved.subject, /welcome|in\b/i);
  assert.match(approved.html, /hellomeetcute\.com\/apply/);
  assert.match(approved.html, /Round out your profile/);

  // 3. Match reminder ("reminder to meet").
  const reminder = matchReminderEmail({ toName: "Maya Rosen", otherName: "Alex Chen", city: "NYC" });
  assertWellFormed("matchReminder", reminder);
  assertOnBrand("matchReminder", reminder);
  assert.match(reminder.subject, /Alex/);
  assert.match(reminder.text, /both said yes/);

  // 4. Match feedback ("how was your Meet Cute").
  const feedback = matchFeedbackEmail({ toName: "Maya", otherName: "Alex Chen" });
  assertWellFormed("matchFeedback", feedback);
  assertOnBrand("matchFeedback", feedback);
  assert.match(feedback.subject, /how was/i);
  assert.match(feedback.subject, /Alex/);

  // 5. Operator lead (dinner + coaching intake -> operator inbox).
  const dinnerLead = operatorLeadEmail({
    kind: "dinner",
    name: "Sam Lee",
    email: "sam@example.com",
    detail: "Vegetarian, prefers Thursdays",
    context: "March SF dinner",
  });
  assertWellFormed("operatorLead(dinner)", dinnerLead);
  assertOnBrand("operatorLead(dinner)", dinnerLead);
  assert.match(dinnerLead.subject, /Dinner seat request/);
  assert.match(dinnerLead.text, /sam@example\.com/);
  const coachingLead = operatorLeadEmail({
    kind: "coaching",
    name: "Sam Lee",
    email: "sam@example.com",
    detail: "Looking for dating coaching",
  });
  assertWellFormed("operatorLead(coaching)", coachingLead);
  assert.match(coachingLead.subject, /Coaching request/);

  // 6. Request received (confirmation to requester).
  const reqDinner = requestReceivedEmail({ name: "Sam Lee", kind: "dinner", context: "March SF dinner" });
  assertWellFormed("requestReceived(dinner)", reqDinner);
  assertOnBrand("requestReceived(dinner)", reqDinner);
  assert.match(reqDinner.subject, /dinner/i);
  const reqCoaching = requestReceivedEmail({ name: "Sam Lee", kind: "coaching" });
  assertWellFormed("requestReceived(coaching)", reqCoaching);
  assert.match(reqCoaching.subject, /coaching/i);

  // 7. Core match emails must ride the SAME shell after the redesign migration.
  const invite = matchInviteEmail({
    toName: "Maya Rosen",
    otherName: "Alex Chen",
    otherHeadline: "Architect who cooks",
    city: "NYC",
    profileUrl: "https://hellomeetcute.com/i/tok",
  });
  assertWellFormed("matchInvite", invite);
  assertOnBrand("matchInvite", invite);
  assert.match(invite.subject, /matched with Alex/);
  assert.match(invite.text, /reply Y/i);
  assert.match(invite.html, /hellomeetcute\.com\/i\/tok/);

  const connection = connectionEmail({
    toName: "Maya Rosen",
    otherName: "Alex Chen",
    otherEmail: "alex@example.com",
    city: "NYC",
  });
  assertWellFormed("connection", connection);
  assertOnBrand("connection", connection);
  assert.match(connection.subject, /both said yes/);
  assert.match(connection.html, /alex@example\.com/);

  const thread = matchThreadEmail({
    aName: "Maya Rosen",
    bName: "Alex Chen",
    city: "NYC",
  });
  assertWellFormed("matchThread", thread);
  assertOnBrand("matchThread", thread);

  const event = eventInviteEmail({
    name: "Maya Rosen",
    theme: "Long table, short strangers",
    city: "NYC",
    venue: "Le Coucou",
    when: "Thursday, March 12 at 7pm",
    link: "https://hellomeetcute.com/dinners",
  });
  assertWellFormed("eventInvite", event);
  assertOnBrand("eventInvite", event);
  assert.match(event.subject, /invited/i);

  // HTML-injection guard: a hostile display name must not break out into markup.
  const hostile = applicationApprovedEmail({
    name: '<script>alert(1)</script>',
    appUrl: "https://hellomeetcute.com/apply",
  });
  assert.ok(!hostile.html.includes("<script>alert(1)</script>"), "approved: unescaped name");

  console.log("lifecycle + intake email render checks passed (10 templates, on-brand, escaped)");
}

main();
