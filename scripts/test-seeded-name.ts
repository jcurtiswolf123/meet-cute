// Telling a name we invented apart from a name somebody typed.
//
// Sign-in gives a brand-new row a name built from the email local part, so it
// is never nameless. The application must not show that back: being asked to
// confirm a name you never gave is worse than being asked for it.
//
// It used to decide this by asking whether the row had an applicationStep,
// which is only a proxy for "started after the form became a sequence of
// steps". On 4 August that stranded the 25 unfinished applicants from the old
// one-page form, 6 of whom had typed a real name, at an empty first-name field,
// with a surname that had meanwhile become required. The form asked them for
// something it was already holding.

import assert from "node:assert/strict";
import { seededNameFor, nameWasGiven } from "../src/lib/application-steps";

assert.equal(seededNameFor("aktaylor410@gmail.com"), "Aktaylor410");
assert.equal(seededNameFor("john.smith@example.com"), "John Smith");
assert.equal(seededNameFor("a_b-c@example.com"), "A B C");
assert.equal(seededNameFor(""), "New member");
assert.equal(seededNameFor(null), "New member");

// A row still carrying its seeded name has not been answered.
assert.equal(nameWasGiven({ name: "Aktaylor410", email: "aktaylor410@gmail.com" }), false);
// Including the case the old proxy could never catch: a seeded name that has a
// surname and looks entirely real.
assert.equal(nameWasGiven({ name: "John Smith", email: "john.smith@example.com" }), false);
// Case and spacing are ours, not theirs, so they must not flip the answer.
assert.equal(nameWasGiven({ name: "john smith", email: "john.smith@example.com" }), false);
assert.equal(nameWasGiven({ name: "  Aktaylor410  ", email: "aktaylor410@gmail.com" }), false);

// A name somebody actually typed is kept, and this is the whole point: it is
// true regardless of whether they ever reached a recorded step.
assert.equal(nameWasGiven({ name: "Ali Taylor", email: "aktaylor410@gmail.com" }), true);
assert.equal(nameWasGiven({ name: "John Smithson", email: "john.smith@example.com" }), true);
assert.equal(nameWasGiven({ name: "", email: "a@b.com" }), false);
assert.equal(nameWasGiven({ name: null, email: "a@b.com" }), false);

console.log(
  "seeded name checks passed: an invented name is recognised as invented, including one that looks real, and a typed name survives with no recorded step",
);
