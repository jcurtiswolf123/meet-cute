// Corpus test for reading a Y/N decision out of a real email reply.
//
// The match-email journey test covers the database and outbox path with
// synthetic one-word bodies. This covers the seam that test cannot reach: what
// actual mail clients put on the wire. Every case below is a shape a real
// client produces (Gmail top-post, Apple Mail bottom-post under the quote,
// Outlook's "-----Original Message-----" block, iPhone signature, HTML with no
// text part, autoresponders, and the greeting prefixes people actually write).
//
// The asymmetry that matters: a missed decision is harmless because the invite
// also carries Yes/Pass buttons, but a wrong "yes" sends the joint connection
// email and hands both people each other's contact details. So every ambiguous
// case must resolve to null, never to "yes".
//
// Pure functions only, no database:
//   node --import tsx scripts/test-reply-parse.ts
import assert from "node:assert/strict";
import { decisionFromReply, htmlToReplyText, stripQuotedHistory } from "../src/lib/reply-parse";

type Case = {
  name: string;
  text?: string;
  html?: string;
  expect: "yes" | "pass" | null;
};

const GMAIL_QUOTE =
  "On Mon, Jul 27, 2026 at 9:02 AM Mutuals <r+tok@inbound.shiftsupportnetwork.com> wrote:\n" +
  "> We think you two should meet. Reply Y to say yes, N to pass.\n" +
  "> View her profile: https://hellomeetcute.com/i/tok\n";

const cases: Case[] = [
  // --- plain affirmatives -------------------------------------------------
  { name: "bare Y", text: "Y", expect: "yes" },
  { name: "bare yes", text: "yes", expect: "yes" },
  { name: "yes with punctuation", text: "Yes!", expect: "yes" },
  { name: "yeah", text: "Yeah, she seems great", expect: "yes" },
  { name: "yep", text: "yep", expect: "yes" },
  { name: "absolutely", text: "Absolutely, set it up", expect: "yes" },
  { name: "i'm in", text: "I'm in", expect: "yes" },
  { name: "sounds good", text: "Sounds good to me", expect: "yes" },
  { name: "would love to", text: "I'd love to meet her", expect: "yes" },

  // --- plain refusals -----------------------------------------------------
  { name: "bare N", text: "N", expect: "pass" },
  { name: "no thank you", text: "No thank you", expect: "pass" },
  { name: "nope pass", text: "nope, pass", expect: "pass" },
  { name: "i'll pass", text: "I'll pass on this one", expect: "pass" },
  { name: "not for me", text: "Not for me, sorry", expect: "pass" },
  { name: "not interested", text: "Not interested right now", expect: "pass" },
  { name: "rather not", text: "I'd rather not", expect: "pass" },

  // --- the severe class: agreeable opener, actual refusal -----------------
  // These used to read as "yes" and would have sent the connection email.
  {
    name: "okay then pass",
    text: "Okay so I am going to pass on this one, thanks though.",
    expect: null,
  },
  { name: "ok not for me", text: "Ok, honestly not for me.", expect: null },
  { name: "definitely not", text: "Definitely not", expect: "pass" },
  { name: "absolutely not", text: "Absolutely not, sorry", expect: "pass" },
  { name: "sure not", text: "Sure... not my type", expect: "pass" },
  { name: "sure but pass", text: "Sure, I see the appeal, but I'll pass.", expect: null },
  {
    name: "yes-ish then decline",
    text: "Yes I appreciate the thought but I'm going to decline",
    expect: null,
  },

  // --- greeting prefixes --------------------------------------------------
  { name: "greeting then yes", text: "Hi Josh - yes, I would love to meet her.", expect: "yes" },
  { name: "hey comma yes", text: "Hey! Yes please.", expect: "yes" },
  { name: "thanks then no", text: "Thanks Josh, no thank you.", expect: "pass" },

  // --- client-specific shapes --------------------------------------------
  { name: "gmail top-post yes", text: `Yes! She looks great.\n\n${GMAIL_QUOTE}`, expect: "yes" },
  { name: "gmail top-post no", text: `No thanks.\n\n${GMAIL_QUOTE}`, expect: "pass" },
  {
    name: "apple mail bottom-post under quote",
    text:
      "> On Jul 27, 2026, at 9:02 AM, Mutuals <r+tok@inbound.shiftsupportnetwork.com> wrote:\n" +
      "> We think you two should meet. Reply Y to say yes, N to pass.\n" +
      "\nYes please\n",
    expect: "yes",
  },
  {
    name: "iphone yes with signature",
    text: "Y\n\nSent from my iPhone\n\n> On Jul 27, 2026, at 9:02 AM, Mutuals wrote:\n> Reply Y or N",
    expect: "yes",
  },
  {
    name: "outlook original-message block",
    text:
      "No thank you.\r\n\r\n-----Original Message-----\r\nFrom: Mutuals\r\nSent: Monday, July 27, 2026\r\nSubject: An introduction\r\n\r\nReply Y to say yes",
    expect: "pass",
  },
  {
    name: "outlook underscore rule + From block",
    text: "Yes, works for me\r\n\r\n________________________________\r\nFrom: Mutuals\r\nSent: Monday\r\n",
    expect: "yes",
  },
  {
    name: "spanish quote header",
    text: "Si, claro\n\nEl lun, 27 jul 2026 a las 9:02, Mutuals escribio:\n> Responde Y o N",
    expect: null, // "Si" is not in the affirmative set; ambiguity is safe, not connected
  },
  {
    name: "german quote header still trims history",
    text: "Yes\n\nAm 27.07.2026 um 09:02 schrieb Mutuals:\n> Antworte mit Y",
    expect: "yes",
  },

  // --- HTML-only replies (no text/plain part) -----------------------------
  {
    name: "html-only gmail reply with blockquote",
    html:
      '<div dir="ltr">Yes, I am in</div><br><div class="gmail_quote">' +
      '<div dir="ltr" class="gmail_attr">On Mon, Jul 27, 2026 Mutuals wrote:</div>' +
      "<blockquote>Reply Y to say yes, N to pass</blockquote></div>",
    expect: "yes",
  },
  {
    name: "html-only outlook reply",
    html:
      '<html><body><div>No thanks &mdash; not for me</div>' +
      '<div id="appendonsend"></div><hr><div>From: Mutuals</div></body></html>',
    expect: "pass",
  },
  {
    name: "html-only bottom-post under blockquote",
    html: "<blockquote>Reply Y to say yes, N to pass</blockquote><div>Yes please!</div>",
    expect: "yes",
  },
  {
    name: "html with entities",
    html: "<div>Yes &amp; thank you&nbsp;&mdash; she looks lovely</div>",
    expect: "yes",
  },
  {
    name: "empty text part falls through to html",
    text: "   ",
    html: "<div>Y</div>",
    expect: "yes",
  },

  // --- automated mail -----------------------------------------------------
  {
    name: "out of office",
    text: "Automatic reply: I am out of the office until Aug 4 with no email access.",
    expect: null,
  },
  { name: "away from office", text: "Out of office until Monday", expect: null },
  { name: "bounce notification", text: "Delivery Status Notification (Failure)", expect: null },

  // --- genuinely ambiguous, must not decide -------------------------------
  { name: "not sure", text: "Not sure yet, can I see more photos?", expect: null },
  { name: "a question", text: "What does she do for work?", expect: null },
  { name: "maybe", text: "Maybe? Let me think about it", expect: null },
  { name: "empty body", text: "", expect: null },
  { name: "quote only", text: GMAIL_QUOTE, expect: null },
  { name: "whitespace only", text: "\n\n   \n", expect: null },

  // --- false-friend negatives must not block a real yes -------------------
  { name: "yes plus no rush", text: "Yes please, no rush on scheduling", expect: "yes" },
  { name: "yes plus no problem", text: "Yes - no problem at all", expect: "yes" },
  { name: "yes plus no worries", text: "Yeah, no worries, go ahead", expect: "yes" },
];

function main() {
  let failures = 0;
  for (const testCase of cases) {
    const actual = decisionFromReply(testCase.text, testCase.html);
    if (actual !== testCase.expect) {
      failures += 1;
      console.error(
        `FAIL ${testCase.name}: expected ${String(testCase.expect)}, got ${String(actual)}`,
      );
    }
  }

  // No ambiguous or automated case may ever produce a yes. This is the property
  // that protects the connection email, so it is asserted separately from the
  // per-case expectations above.
  for (const testCase of cases.filter((c) => c.expect === null)) {
    assert.notEqual(
      decisionFromReply(testCase.text, testCase.html),
      "yes",
      `ambiguous case "${testCase.name}" must never read as yes`,
    );
  }

  // Helper behaviour the route depends on.
  assert.equal(stripQuotedHistory(`Yes\n\n${GMAIL_QUOTE}`), "Yes");
  assert.match(htmlToReplyText("<div>Yes</div><blockquote>Reply Y</blockquote>"), /Yes/);
  assert.doesNotMatch(
    htmlToReplyText("<div>Yes</div><blockquote>Reply Y to say yes</blockquote>"),
    /Reply Y to say yes/,
  );

  if (failures) {
    throw new Error(`${failures} of ${cases.length} reply-parse cases failed`);
  }
  console.log(
    `reply parse passed: ${cases.length} real-client reply shapes, ` +
      "no ambiguous or automated reply reads as yes",
  );
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
