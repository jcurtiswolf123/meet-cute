// Render tests for the transactional lifecycle + intake emails.
//
// These are pure template functions, so we can assert on real copy, subjects,
// and that every message rides the shared Mutuals brand shell (one restrained
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
  recommendationRequestEmail,
  recommendationReceivedEmail,
  recommendationThanksEmail,
  recommenderFollowUpEmail,
  unfinishedApplicationEmail,
  signInLinkUnusedEmail,
  bareAddress,
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
  assert.ok(msg.html.includes("Mutuals"), `${label}: missing wordmark`);
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
    appUrl: "https://hellomutuals.com/apply",
  });
  assertWellFormed("applicationApproved", approved);
  assertOnBrand("applicationApproved", approved);
  assert.match(approved.subject, /welcome|in\b/i);
  assert.match(approved.html, /hellomutuals\.com\/apply/);
  assert.match(approved.html, /Round out your profile/);

  // 3. Match reminder ("reminder to meet").
  const reminder = matchReminderEmail({ toName: "Maya Rosen", otherName: "Alex Chen", city: "NYC" });
  assertWellFormed("matchReminder", reminder);
  assertOnBrand("matchReminder", reminder);
  assert.match(reminder.subject, /Alex/);
  assert.match(reminder.text, /both said yes/);

  // 4. Match feedback ("how was your date").
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
    other: {
      name: "Alex Chen",
      age: 34,
      neighborhood: "Cobble Hill",
      headline: "Architect who cooks",
      bio: "I draw buildings all day and feed people all night.",
      lookingFor: "Someone who argues about food.",
      dealBreakers: "Smoking.",
      recommendation: "Alex is the most curious person I know.",
      voucherName: "Priya N.",
      prompts: [{ question: "A perfect Sunday", answer: "Greenmarket, then nothing." }],
      photoUrl: "https://hellomutuals.com/api/invite/tok/photo/p1.webp",
    },
    matchmakerNote: "You both moved from Chicago last year.",
    profileUrl: "https://hellomutuals.com/i/tok",
  });
  assertWellFormed("matchInvite", invite);
  assertOnBrand("matchInvite", invite);
  assert.match(invite.subject, /introduction to Alex/i);
  assert.match(invite.text, /reply Y/i);
  assert.match(invite.html, /hellomutuals\.com\/i\/tok/);
  // The profile travels in the email itself, in the member's own words.
  for (const own of ["I draw buildings all day", "Someone who argues about food", "A perfect Sunday", "most curious person I know"]) {
    assert.ok(invite.html.includes(own.replace(/'/g, "&#39;")), `matchInvite html is missing "${own}"`);
    assert.ok(invite.text.includes(own), `matchInvite text is missing "${own}"`);
  }
  assert.match(invite.html, /api\/invite\/tok\/photo\/p1\.webp/);
  assert.match(invite.text, /You both moved from Chicago last year/);

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
    link: "https://hellomutuals.com/dinners",
  });
  assertWellFormed("eventInvite", event);
  assertOnBrand("eventInvite", event);
  assert.match(event.subject, /invited/i);

  // 11. Recommendation request. This one goes to someone who never signed up
  // for anything, carries a capability token, and is the only email in the
  // system whose recipient is not a member, so it gets the closest reading.
  const request = recommendationRequestEmail({
    recommenderName: "Ada Lovelace",
    applicantName: "Maya Rosen",
    applicantCity: "NYC",
    link: "https://hellomutuals.com/r/tok3n",
  });
  assertWellFormed("recommendationRequest", request);
  assertOnBrand("recommendationRequest", request);
  assert.match(request.subject, /Maya/, "the person who caused this email must be named in the subject");
  assert.match(request.html, /hellomutuals\.com\/r\/tok3n/);
  assert.match(request.text, /not accepted until two friends write back/);
  assert.match(request.html, /New York/);
  // The applicant's own line, and the "just reply" affordance, are the two
  // things in this email that raise the reply rate. Both are conditional, so
  // both can silently stop rendering.
  const withNote = recommendationRequestEmail({
    recommenderName: "Ada Lovelace",
    applicantName: "Maya Rosen",
    link: "https://hellomutuals.com/r/tok3n",
    applicantNote: "Ada, this is the thing I mentioned on Sunday.",
    replyToVouch: true,
  });
  assertWellFormed("recommendationRequest(note)", withNote);
  assert.match(withNote.html, /this is the thing I mentioned on Sunday/);
  assert.match(withNote.text, /just hit reply/i, "The cheapest way to answer has to be named.");
  assert.doesNotMatch(
    request.text,
    /just hit reply/i,
    "And only when the message actually carries a reply-to that can route it.",
  );
  const hostileNote = recommendationRequestEmail({
    recommenderName: "Ada",
    applicantName: "Maya",
    link: "https://hellomutuals.com/r/tok3n",
    applicantNote: '<img src=x onerror="alert(1)">',
  });
  assert.ok(!hostileNote.html.includes("<img"), "request: applicant note rendered live");

  // Nine friends were asked before an operator approved the applicant anyway.
  // Telling them "they are not in until you write" would be false, and these
  // are exactly the people whose goodwill the loop depends on.
  const settled = recommendationRequestEmail({
    recommenderName: "Ada Lovelace",
    applicantName: "Maya Rosen",
    link: "https://hellomutuals.com/r/tok3n",
    reminder: true,
    applicantAccepted: true,
  });
  assertWellFormed("recommendationRequest(accepted)", settled);
  assertOnBrand("recommendationRequest(accepted)", settled);
  assert.doesNotMatch(
    settled.text,
    /not accepted until/i,
    "Never tell someone an applicant is blocked on them when the applicant is already in.",
  );
  assert.match(settled.text, /already a member/);
  assert.match(settled.text, /your words/i);
  assert.match(request.text, /not accepted until two friends write back/, "The ordinary ask is unchanged.");

  const nudge = recommendationRequestEmail({
    recommenderName: "Ada Lovelace",
    applicantName: "Maya Rosen",
    link: "https://hellomutuals.com/r/tok3n",
    reminder: true,
  });
  assertWellFormed("recommendationRequest(reminder)", nudge);
  assert.notEqual(nudge.subject, request.subject, "a nudge must not repeat the first subject line");

  // 12. Applicant told a friend wrote back, and the friend thanked.
  const oneIn = applicationReceivedEmail({
    name: "Maya Rosen",
    city: "NYC",
    recommenders: [
      { name: "Ada Lovelace", status: "requested" },
      { name: "Grace Hopper", status: "requested" },
    ],
    statusUrl: "https://hellomutuals.com/apply/thanks",
  });
  assertWellFormed("applicationReceived(withRecommenders)", oneIn);
  assert.match(oneIn.html, /Ada and Grace/, "the applicant is told exactly who was asked");

  const gotOne = recommendationReceivedEmail({
    name: "Maya Rosen",
    recommenderName: "Ada Lovelace",
    remaining: 1,
    statusUrl: "https://hellomutuals.com/apply/thanks",
    wroteWords: true,
  });
  assertWellFormed("recommendationReceived", gotOne);
  assertOnBrand("recommendationReceived", gotOne);
  assert.match(gotOne.text, /One more recommendation/);
  assert.match(gotOne.text, /just wrote your recommendation/);

  // The same event from a friend who tapped rather than wrote. It still counts
  // and the applicant still hears about it; it just must not promise a
  // recommendation nobody typed.
  const tappedFor = recommendationReceivedEmail({
    name: "Maya Rosen",
    recommenderName: "Ada Lovelace",
    remaining: 1,
    statusUrl: "https://hellomutuals.com/apply/thanks",
    wroteWords: false,
  });
  assertWellFormed("recommendationReceived(tapped)", tappedFor);
  assertOnBrand("recommendationReceived(tapped)", tappedFor);
  assert.doesNotMatch(tappedFor.text, /wrote your recommendation/);
  assert.match(tappedFor.text, /just vouched for you/);
  assert.match(tappedFor.text, /One more recommendation/);

  // All four combinations, because two things vary independently: whether that
  // answer was the one that got them in, and whether there are any words to put
  // on a profile. Collapsing them told a friend who tapped that "your words are
  // on their profile" when they had written none, which is both untrue and the
  // one moment they might have written some.
  const thanks = recommendationThanksEmail({
    recommenderName: "Ada Lovelace",
    applicantName: "Maya Rosen",
    accepted: true,
    wroteWords: true,
    applyUrl: "https://hellomutuals.com/apply",
  });
  assertWellFormed("recommendationThanks", thanks);
  assertOnBrand("recommendationThanks", thanks);
  assert.match(thanks.text, /Maya is in/);
  assert.match(thanks.text, /your words are on their profile/);

  const stillWaiting = recommendationThanksEmail({
    recommenderName: "Ada Lovelace",
    applicantName: "Maya Rosen",
    accepted: false,
    wroteWords: true,
    applyUrl: "https://hellomutuals.com/apply",
  });
  assertWellFormed("recommendationThanks(stillWaiting)", stillWaiting);
  assert.match(stillWaiting.text, /one more friend/);

  for (const [label, accepted] of [["tapped, accepted", true], ["tapped, still waiting", false]] as const) {
    const tapped = recommendationThanksEmail({
      recommenderName: "Ada Lovelace",
      applicantName: "Maya Rosen",
      accepted,
      wroteWords: false,
      applyUrl: "https://hellomutuals.com/apply",
      vouchUrl: "https://hellomutuals.com/r/tok123",
    });
    assertWellFormed(`recommendationThanks(${label})`, tapped);
    assertOnBrand(`recommendationThanks(${label})`, tapped);
    assert.doesNotMatch(
      tapped.text,
      /your words|It is on Maya's profile/,
      `${label}: a tap writes nothing, so nothing may claim it did.`,
    );
    assert.match(tapped.text, /line or two/, `${label}: and the one moment they are paying attention must ask.`);
    assert.ok(tapped.html.includes("https://hellomutuals.com/r/tok123"), `${label}: with a link back to their own ask.`);
  }
  assert.match(
    recommendationThanksEmail({
      recommenderName: "Ada Lovelace",
      applicantName: "Maya Rosen",
      accepted: true,
      wroteWords: false,
      applyUrl: "https://hellomutuals.com/apply",
      vouchUrl: "https://hellomutuals.com/r/tok123",
    }).text,
    /Maya is in/,
    "A tap still gets somebody in, and the email still says so.",
  );

  // The delayed follow-up, which is the growth ask. Same trap as the two above:
  // it told a tapper their words were on a profile.
  for (const wroteWords of [true, false]) {
    for (const accepted of [true, false]) {
      const followUp = recommenderFollowUpEmail({
        recommenderName: "Ada Lovelace",
        applicantName: "Maya Rosen",
        accepted,
        wroteWords,
        applyUrl: "https://hellomutuals.com/apply?from=tok123",
      });
      const label = `recommenderFollowUp(${wroteWords ? "wrote" : "tapped"}, ${accepted ? "in" : "waiting"})`;
      assertWellFormed(label, followUp);
      assertOnBrand(label, followUp);
      if (!wroteWords) {
        assert.doesNotMatch(followUp.text, /Your words are on their profile/, `${label}: a tap wrote nothing.`);
      }
      assert.match(followUp.text, /only have to ask one friend/, `${label}: the flywheel ask must survive every variant.`);
    }
  }

  // 14. The chase for an application that was started and abandoned. It names
  // what the person already did, because someone who uploaded five photos is
  // not a lead to re-pitch, they are someone who was nearly finished.
  const nearly = unfinishedApplicationEmail({
    name: "Maya Rosen",
    photos: 5,
    applyUrl: "https://hellomutuals.com/apply",
  });
  assertWellFormed("unfinishedApplication(withPhotos)", nearly);
  assertOnBrand("unfinishedApplication(withPhotos)", nearly);
  assert.match(nearly.text, /5 photos/, "It has to name what they already did.");
  assert.match(nearly.text, /still saved/i, "And say that it was not wasted.");
  assert.match(nearly.subject, /saved/i);

  const nothingYet = unfinishedApplicationEmail({
    name: "Maya Rosen",
    photos: 0,
    applyUrl: "https://hellomutuals.com/apply",
  });
  assertWellFormed("unfinishedApplication(noPhotos)", nothingYet);
  assert.doesNotMatch(
    nothingYet.text,
    /0 photos|photos are still/i,
    "Nobody is told about the photos they did not upload.",
  );
  const singular = unfinishedApplicationEmail({
    name: "Maya",
    photos: 1,
    applyUrl: "https://hellomutuals.com/apply",
  });
  assert.match(singular.text, /a photo/, "One photo is a photo, not 1 photos.");
  assert.doesNotMatch(singular.text, /1 photos/);

  // Someone who saved their details and stopped at the friends is one screen
  // from being a member. Telling them to "pick up where you left off" as though
  // they were halfway up a form is both wrong and less compelling.
  const halfway = unfinishedApplicationEmail({
    name: "Maya Rosen",
    photos: 4,
    basicsSaved: true,
    applyUrl: "https://hellomutuals.com/apply/friends",
  });
  assertWellFormed("unfinishedApplication(basicsSaved)", halfway);
  assertOnBrand("unfinishedApplication(basicsSaved)", halfway);
  assert.match(halfway.text, /Everything about you is saved/);
  assert.match(halfway.text, /two names and two email addresses/i);
  assert.match(halfway.html, /apply\/friends/, "It has to land them on the half they stopped at.");
  assert.doesNotMatch(
    halfway.text,
    /your city, your date of birth/,
    "Never ask again for what they have already given.",
  );

  // 15. The unused sign-in link. The one email in the system sent to somebody
  // with no Person row at all, so it is also the only one that must not carry
  // anything that signs a person in.
  const unused = signInLinkUnusedEmail({
    email: "maya@example.com",
    applyUrl: "https://hellomutuals.com/apply?email=maya%40example.com",
  });
  assertWellFormed("signInLinkUnused", unused);
  assertOnBrand("signInLinkUnused", unused);
  assert.match(unused.subject, /expired/i);
  assert.match(unused.html, /apply\?email=/, "It sends them back to the form, prefilled.");
  assert.doesNotMatch(
    unused.html,
    /auth\/verify|token=/,
    "It must never carry a sign-in token: minting a long-lived one into an unproven inbox is how a magic-link system becomes an account-takeover system.",
  );

  // HTML-injection guard: a hostile display name must not break out into markup.
  // The recommendation request carries an applicant-supplied name to a stranger.
  const hostileRequest = recommendationRequestEmail({
    recommenderName: '<img src=x onerror="alert(1)">',
    applicantName: '<script>alert(1)</script>',
    link: "https://hellomutuals.com/r/tok3n",
  });
  assert.ok(!hostileRequest.html.includes("<script>alert(1)</script>"), "request: unescaped applicant name");
  assert.ok(!hostileRequest.html.includes("<img"), "request: hostile tag rendered live");

  const hostile = applicationApprovedEmail({
    name: '<script>alert(1)</script>',
    appUrl: "https://hellomutuals.com/apply",
  });
  assert.ok(!hostile.html.includes("<script>alert(1)</script>"), "approved: unescaped name");

  // The invite carries the most member-supplied text of any template, and it is
  // delivered to a DIFFERENT member's inbox, so an unescaped field here is one
  // member injecting markup into another's mail. Every free-text field is
  // hostile in this case.
  const attack = '<img src=x onerror="alert(1)">';
  const hostileInvite = matchInviteEmail({
    toName: "Recipient",
    other: {
      name: `Mallory ${attack}`,
      age: 30,
      neighborhood: attack,
      headline: attack,
      bio: attack,
      lookingFor: attack,
      dealBreakers: attack,
      recommendation: attack,
      voucherName: attack,
      prompts: [{ question: attack, answer: attack }],
    },
    matchmakerNote: attack,
    profileUrl: "https://hellomutuals.com/i/tok3n",
  });
  assert.ok(!hostileInvite.html.includes(attack), "invite: unescaped member field");
  // The escaped text legitimately still contains the characters "onerror=", so
  // assert on the tag itself: what must never appear is a live element.
  assert.ok(!hostileInvite.html.includes("<img"), "invite: hostile tag rendered live");
  assert.ok(hostileInvite.html.includes("&lt;img"), "invite: markup should be escaped, not stripped");

  // h1() escapes its own argument. Escaping again at the call site turned a name
  // containing an ampersand into "&amp;amp;" in the subject headline.
  const amp = connectionEmail({
    toName: "Recipient",
    otherName: "Ben & Jerry",
    otherEmail: "ben@example.com",
  });
  assert.ok(!amp.html.includes("&amp;amp;"), "connection: double-escaped headline");

  // List-Unsubscribe takes a bare addr-spec. Every invite used to ship
  // `<mailto:Mutuals <r+token@...>>`, an unparseable header that counts
  // against inbox placement instead of for it.
  assert.equal(
    bareAddress("Mutuals <r+tok3n@inbound.shiftsupportnetwork.com>"),
    "r+tok3n@inbound.shiftsupportnetwork.com",
  );
  assert.equal(bareAddress("hello@hellomutuals.com"), "hello@hellomutuals.com");
  assert.equal(bareAddress("  spaced@example.com  "), "spaced@example.com");
  assert.doesNotMatch(
    `<mailto:${bareAddress("Mutuals <r+tok3n@example.com>")}>`,
    /<mailto:[^>]*</,
    "List-Unsubscribe must not nest angle brackets",
  );

  console.log(
    "lifecycle + intake email render checks passed (15 templates, on-brand, escaped, " +
      "List-Unsubscribe well formed)",
  );
}

main();
