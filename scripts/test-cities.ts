// Markets, and the people who live in two of them.
//
// City was a bare string compared against "SF" and "NYC" in sixteen files, with
// "anything that is not SF" meaning New York. The risk in adding a third is not
// that Los Angeles fails loudly; it is that one missed comparison quietly files
// an Angeleno in New York and nobody finds out until a matchmaker tries to
// introduce them to someone three thousand miles away.

import assert from "node:assert/strict";
import {
  CITIES,
  citiesLabel,
  citiesOf,
  cityLabel,
  cityShort,
  cityWhere,
  isCity,
  normalizeCity,
  sharesCity,
} from "../src/lib/cities";

function main() {
  assert.deepEqual(CITIES.map((c) => c.value), ["NYC", "SF", "LA"]);
  assert.equal(isCity("LA"), true);
  assert.equal(isCity("Chicago"), false);
  assert.equal(isCity(null), false);

  // Every shape the codebase has ever stored or posted has to land on the same
  // city. The studio team form posts the display name; the apply form posts the
  // code; older rows hold the code.
  assert.equal(normalizeCity("SF"), "SF");
  assert.equal(normalizeCity("San Francisco"), "SF");
  assert.equal(normalizeCity("san francisco"), "SF");
  assert.equal(normalizeCity("Bay Area"), "SF");
  assert.equal(normalizeCity("LA"), "LA");
  assert.equal(normalizeCity("Los Angeles"), "LA");
  assert.equal(normalizeCity("los angeles"), "LA");
  assert.equal(normalizeCity("New York"), "NYC");
  assert.equal(normalizeCity("NYC"), "NYC");
  // The old code read "anything that is not SF" as New York. Unknown input
  // still falls back rather than throwing, because a half-typed city must not
  // lose an application, but the fallback is explicit and callable.
  assert.equal(normalizeCity(""), "NYC");
  assert.equal(normalizeCity("Paris"), "NYC");
  assert.equal(normalizeCity("Paris", "LA"), "LA");

  assert.equal(cityLabel("LA"), "Los Angeles");
  assert.equal(cityShort("Los Angeles"), "LA");
  assert.equal(cityLabel("SF"), "San Francisco");

  // One city, two cities, and the same city named twice.
  assert.deepEqual(citiesOf({ city: "SF" }), ["SF"]);
  assert.deepEqual(citiesOf({ city: "SF", secondCity: "LA" }), ["SF", "LA"]);
  assert.deepEqual(citiesOf({ city: "SF", secondCity: "SF" }), ["SF"]);
  assert.deepEqual(citiesOf({ city: "SF", secondCity: null }), ["SF"]);
  assert.deepEqual(citiesOf({ city: "San Francisco", secondCity: "Los Angeles" }), ["SF", "LA"]);

  assert.equal(citiesLabel({ city: "SF", secondCity: "LA" }), "San Francisco and Los Angeles");
  assert.equal(citiesLabel({ city: "NYC" }), "New York");

  // The comparison every matching surface has to use. Someone who splits their
  // time is introducible in both markets, which is the entire point of the
  // second slot: they were picking one and disappearing from the other.
  assert.equal(sharesCity({ city: "SF" }, { city: "SF" }), true);
  assert.equal(sharesCity({ city: "SF" }, { city: "LA" }), false);
  assert.equal(sharesCity({ city: "SF", secondCity: "LA" }, { city: "LA" }), true);
  assert.equal(sharesCity({ city: "LA" }, { city: "SF", secondCity: "LA" }), true);
  assert.equal(sharesCity({ city: "NYC" }, { city: "SF", secondCity: "LA" }), false);

  // The filter has to look at both slots, or half the people who split their
  // time vanish from the market they are standing in.
  assert.deepEqual(cityWhere("LA"), { OR: [{ city: "LA" }, { secondCity: "LA" }] });
  assert.deepEqual(cityWhere("Los Angeles"), { OR: [{ city: "LA" }, { secondCity: "LA" }] });

  console.log(
    "city checks passed: three markets, every stored and posted spelling normalized, two cities per person, and matching that reads both slots",
  );
}

main();
