// The date-ideas safety contract, tested where it actually lives.
//
// The one failure that matters is a venue reaching a member that does not
// exist. Everything below exists to pin that shut, plus the "this must never
// break the connection email" and "never claim a booking" promises.
//
// Pure functions only: no database, no network, no model. Runs in CI.
import assert from "node:assert/strict";
import type { Venue } from "@prisma/client";
import { parseIdeaReply, rankVenues, fallbackWhy, NO_IDEAS } from "../src/lib/date-ideas";
import { dateIdeasBlock } from "../src/lib/email-date-ideas";
import { matchThreadEmail } from "../src/lib/email";
import { datePickUrl, datePickToken } from "../src/lib/date-pick";

function venue(over: Partial<Venue> & { id: string; name: string }): Venue {
  return {
    city: "NYC",
    area: null,
    notes: null,
    partner: false,
    address: null,
    bookingUrl: null,
    mapsUrl: null,
    cuisine: null,
    priceBand: null,
    goodFor: null,
    active: true,
    lastVerifiedAt: new Date(),
    ...over,
  } as Venue;
}

const real = venue({ id: "v_real", name: "Via Carota", area: "West Village", cuisine: "Italian" });
const other = venue({ id: "v_other", name: "The Long Island Bar", area: "Cobble Hill" });
const allowed = new Map([real, other].map((v) => [v.id, v]));

// --- the security boundary -------------------------------------------------

// A model that names a place we never offered must produce nothing. This is the
// whole point of returning ids instead of names.
{
  const invented = JSON.stringify({
    picks: [
      { id: "v_hallucinated", why: "A wonderful little spot on Bleecker." },
      { id: "Balthazar", why: "A classic." },
    ],
    wildcard: "Walk the High Line, then coffee.",
  });
  const { ideas, wildcard } = parseIdeaReply(invented, allowed);
  assert.equal(ideas.length, 0, "an invented venue id must never survive parsing");
  // The wildcard names no business, so it is safe to keep even when every pick
  // was rejected.
  assert.equal(wildcard, "Walk the High Line, then coffee.");
}

// A mix of real and invented keeps only the real one.
{
  const mixed = JSON.stringify({
    picks: [
      { id: "v_hallucinated", why: "Invented." },
      { id: "v_real", why: "Quiet enough to actually talk." },
    ],
  });
  const { ideas } = parseIdeaReply(mixed, allowed);
  assert.equal(ideas.length, 1);
  assert.equal(ideas[0].venueId, "v_real");
  assert.equal(ideas[0].name, "Via Carota", "the name must come from the row, not the model");
}

// The model does not get to rename a real venue: only the id is read, every
// other field is copied off the row.
{
  const renamed = JSON.stringify({ picks: [{ id: "v_real", why: "Nice." }] });
  const { ideas } = parseIdeaReply(renamed, allowed);
  assert.equal(ideas[0].name, "Via Carota");
  assert.equal(ideas[0].area, "West Village");
  assert.equal(ideas[0].cuisine, "Italian");
}

// Garbage in, nothing out. None of these may throw or invent.
for (const junk of ["", "   ", "I'd suggest Balthazar!", "{", "{]", "null", "[]", '{"picks":"Balthazar"}', '{"picks":[{"why":"no id"}]}']) {
  const { ideas } = parseIdeaReply(junk, allowed);
  assert.equal(ideas.length, 0, `junk reply must yield no ideas: ${junk}`);
}

// Models wrap JSON in prose and fences constantly; that is recoverable.
{
  const fenced = "Sure!\n```json\n" + JSON.stringify({ picks: [{ id: "v_real", why: "Good for talking." }] }) + "\n```";
  const { ideas } = parseIdeaReply(fenced, allowed);
  assert.equal(ideas.length, 1);
}

// A repeated id is one suggestion, not two.
{
  const dupes = JSON.stringify({ picks: [{ id: "v_real", why: "One." }, { id: "v_real", why: "Two." }] });
  assert.equal(parseIdeaReply(dupes, allowed).ideas.length, 1);
}

// At most three, however many the model returns.
{
  const many = JSON.stringify({ picks: Array.from({ length: 9 }, () => ({ id: "v_real", why: "x" })) });
  assert.ok(parseIdeaReply(many, allowed).ideas.length <= 3);
}

// An empty why falls back to a line built only from columns on the row.
{
  const noWhy = JSON.stringify({ picks: [{ id: "v_real", why: "   " }] });
  const { ideas } = parseIdeaReply(noWhy, allowed);
  assert.ok(ideas[0].why.length > 0);
  assert.equal(ideas[0].why, fallbackWhy(real));
}

// --- ranking ---------------------------------------------------------------

{
  const ranked = rankVenues([other, real], { name: "A", neighborhood: "West Village" }, { name: "B" });
  assert.equal(ranked[0].id, "v_real", "a venue in one person's own neighbourhood ranks first");
  // Stable rather than arbitrary when nothing distinguishes them.
  const tie = rankVenues([other, real], { name: "A" }, { name: "B" });
  assert.deepEqual(
    tie.map((v) => v.id),
    rankVenues([real, other], { name: "A" }, { name: "B" }).map((v) => v.id),
  );
}

// --- rendering -------------------------------------------------------------

// No ideas means no block at all, so the email is byte-identical to before.
{
  const block = dateIdeasBlock(NO_IDEAS);
  assert.equal(block.html, "");
  assert.equal(block.text, "");
  const withIdeas = matchThreadEmail({ aName: "Ada", bName: "Ben", ideas: NO_IDEAS });
  const without = matchThreadEmail({ aName: "Ada", bName: "Ben" });
  assert.equal(withIdeas.html, without.html, "an empty ideas object must not change the email");
  assert.equal(withIdeas.text, without.text);
}

// Venue text is operator-typed and the model writes the why line, so both are
// escaped: this email lands in two other people's inboxes.
{
  const hostile = venue({
    id: "v_x",
    name: `<script>alert(1)</script>`,
    area: `"><img src=x onerror=alert(1)>`,
  });
  const block = dateIdeasBlock({
    ideas: [
      {
        venueId: hostile.id,
        name: hostile.name,
        area: hostile.area,
        cuisine: null,
        priceBand: null,
        address: null,
        bookingUrl: null,
        mapsUrl: null,
        why: `</p><script>alert(2)</script>`,
      },
    ],
    wildcard: `<img src=x onerror=alert(3)>`,
    live: true,
  });
  // The test is that no TAG survives, not that the string "onerror=" is absent:
  // once < > and " are escaped the payload is inert text, and it legitimately
  // still reads onerror=alert(1) on screen.
  assert.ok(!block.html.includes("<script"), "no raw script tag may survive");
  assert.ok(!block.html.includes("<img"), "no raw img tag may survive");
  assert.ok(block.html.includes("&lt;script&gt;"), "it survives as escaped text instead");
  assert.ok(block.html.includes("&lt;img"), "the img payload is escaped, not stripped");
}

// A javascript: or data: URL from an operator-typed field must never become a link.
{
  const block = dateIdeasBlock({
    ideas: [
      {
        venueId: "v_real",
        name: "Via Carota",
        area: null,
        cuisine: null,
        priceBand: null,
        address: null,
        bookingUrl: "javascript:alert(1)",
        mapsUrl: "data:text/html;base64,PHNjcmlwdD4=",
        why: "Good.",
      },
    ],
    wildcard: null,
    live: true,
  });
  assert.ok(!block.html.includes("javascript:"), "javascript: URLs must be dropped");
  assert.ok(!block.html.includes("data:text/html"), "data: URLs must be dropped");
  assert.ok(!block.text.includes("javascript:"));
}

// Mutuals books nothing, and the copy must never suggest otherwise.
{
  const block = dateIdeasBlock({
    ideas: [
      {
        venueId: "v_real",
        name: "Via Carota",
        area: "West Village",
        cuisine: "Italian",
        priceBand: "$$",
        address: null,
        bookingUrl: "https://example.com/book",
        mapsUrl: null,
        why: "Quiet enough to talk.",
      },
    ],
    wildcard: null,
    live: true,
  });
  for (const claim of [/we have booked/i, /table is held/i, /reserved for you/i, /your reservation/i]) {
    assert.doesNotMatch(block.html, claim, `must not claim a booking: ${claim}`);
    assert.doesNotMatch(block.text, claim, `must not claim a booking: ${claim}`);
  }
  assert.match(block.text, /nothing is reserved/i, "must say plainly that nothing is reserved");
  assert.ok(block.html.includes("https://example.com/book"), "the venue's own booking link is offered");
}

// House style: no emoji and no em or en dashes anywhere in the block.
{
  const block = dateIdeasBlock({
    ideas: [{ venueId: "v_real", name: "Via Carota", area: "West Village", cuisine: null, priceBand: null, address: null, bookingUrl: null, mapsUrl: null, why: "Good for talking." }],
    wildcard: "Walk the bridge, then coffee.",
    live: true,
  });
  assert.doesNotMatch(block.html + block.text, /[—–]/, "no em or en dashes");
  assert.doesNotMatch(block.html + block.text, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, "no emoji");
}

// The block reaches the real email, text part included.
{
  const email = matchThreadEmail({
    aName: "Ada Lovelace",
    bName: "Ben Fisher",
    ideas: {
      ideas: [{ venueId: "v_real", name: "Via Carota", area: "West Village", cuisine: null, priceBand: null, address: null, bookingUrl: null, mapsUrl: null, why: "Quiet enough to talk." }],
      wildcard: null,
      live: true,
    },
    pickUrlFor: (id) => `https://hellomutuals.com/d/tok/${id}`,
  });
  assert.match(email.html, /Via Carota/);
  assert.match(email.text, /Via Carota/);
  assert.match(email.html, /d\/tok\/v_real/, "the we're-going-here link is present");
  assert.match(email.text, /reply-all/i, "the original instruction survives");
}

// --- the pick link cannot be emitted broken -------------------------------
// datePickToken returns "" when SESSION_SECRET is unset, and interpolating that
// produced "/d//<venueId>": a link that renders in the email and 404s. Only the
// caller's guard stood between that and a member's inbox.
assert.equal(datePickUrl("", "venue123"), null, "empty token must not produce a URL");
assert.equal(datePickUrl("tok", ""), null, "empty venue id must not produce a URL");

{
  const saved = process.env.SESSION_SECRET;

  process.env.SESSION_SECRET = "";
  assert.equal(datePickToken("match123"), "", "no secret means no token");
  assert.equal(datePickUrl(datePickToken("match123"), "venue123"), null, "no secret means no pick link");

  process.env.SESSION_SECRET = "test-secret-for-the-pick-link";
  const token = datePickToken("match123");
  assert.ok(token.includes("."), "a real token carries a signature");
  const url = datePickUrl(token, "venue123");
  assert.ok(url && !url.includes("/d//"), "a real token produces a well-formed URL");

  process.env.SESSION_SECRET = saved;
}

console.log("date ideas checks passed: an invented venue never survives, nothing claims a booking, and an empty result leaves the email unchanged, and a pick link is never emitted broken");
