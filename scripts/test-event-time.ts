// Regression test for event wall-clock handling.
//
// Both ends of an event date used to be server-local. On Fly that is UTC, so
// "create a NYC dinner at Via Carota on 2026-07-12 7pm" stored 19:00Z, which is
// 3pm in New York, and the ICS attachment then put the dinner on the member's
// calendar three hours before the table. It read back correctly on every page
// only because the render was also UTC, which is what hid it.
//
// It also pins the loose parser: `new Date("2026-07-12 7pm")` is Invalid Date,
// so the co-pilot's own documented example never worked on the fallback path.

import {
  parseEventDate,
  parseLooseWhen,
  formatEventWhen,
  formatEventDay,
  eventZone,
  isPastEvent,
} from "../src/lib/event-time";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

// --- zones -----------------------------------------------------------------
check("NYC zone", eventZone("NYC"), "America/New_York");
check("SF zone", eventZone("SF"), "America/Los_Angeles");
check("unknown city falls back to NYC", eventZone("Austin"), "America/New_York");
check("missing city falls back to NYC", eventZone(null), "America/New_York");

// --- parsing a naive wall clock in the event's city ------------------------
// July is EDT (UTC-4): 7pm New York is 23:00Z.
check("7pm NYC in July", iso(parseEventDate("2026-07-12T19:00", "NYC")), "2026-07-12T23:00:00.000Z");
// July is PDT (UTC-7): 7pm San Francisco is 02:00Z the next day.
check("7pm SF in July", iso(parseEventDate("2026-07-12T19:00", "SF")), "2026-07-13T02:00:00.000Z");
// January is EST (UTC-5), so the offset is not a constant.
check("7pm NYC in January", iso(parseEventDate("2026-01-12T19:00", "NYC")), "2026-01-13T00:00:00.000Z");
// A space instead of the T, which is what people actually type.
check("space separator", iso(parseEventDate("2026-07-12 19:00", "NYC")), "2026-07-12T23:00:00.000Z");
// An explicit offset is already absolute and must be left alone.
check("explicit Z passes through", iso(parseEventDate("2026-07-12T19:00:00Z", "NYC")), "2026-07-12T19:00:00.000Z");
check("explicit offset passes through", iso(parseEventDate("2026-07-12T19:00:00-04:00", "NYC")), "2026-07-12T23:00:00.000Z");
// Garbage is refused rather than written as an Invalid Date.
check("refuses free text", parseEventDate("sometime next week", "NYC"), null);
check("refuses empty", parseEventDate("", "NYC"), null);

// DST boundary: 2026 US spring-forward is 8 March, 2am to 3am local.
check("evening after spring forward", iso(parseEventDate("2026-03-08T19:00", "NYC")), "2026-03-08T23:00:00.000Z");
check("evening before spring forward", iso(parseEventDate("2026-03-07T19:00", "NYC")), "2026-03-08T00:00:00.000Z");

// --- the loose operator phrasing -------------------------------------------
// The exact string in the co-pilot's own help text, which used to fail.
check("'2026-07-12 7pm'", iso(parseLooseWhen("2026-07-12 7pm", "NYC")), "2026-07-12T23:00:00.000Z");
check("'on 2026-07-12 at 7pm'", iso(parseLooseWhen("on 2026-07-12 at 7pm", "NYC")), "2026-07-12T23:00:00.000Z");
check("full command", iso(parseLooseWhen("create a NYC dinner at Via Carota on 2026-07-12 7pm", "NYC")), "2026-07-12T23:00:00.000Z");
check("24h clock", iso(parseLooseWhen("2026-07-12 19:00", "NYC")), "2026-07-12T23:00:00.000Z");
check("half past", iso(parseLooseWhen("2026-07-12 7:30 pm", "NYC")), "2026-07-12T23:30:00.000Z");
check("US slash order", iso(parseLooseWhen("7/12/2026 7pm", "NYC")), "2026-07-12T23:00:00.000Z");
check("date with no time defaults to 7pm", iso(parseLooseWhen("2026-07-12", "NYC")), "2026-07-12T23:00:00.000Z");
check("midnight am", iso(parseLooseWhen("2026-07-12 12am", "NYC")), "2026-07-12T04:00:00.000Z");
check("noon pm", iso(parseLooseWhen("2026-07-12 12pm", "NYC")), "2026-07-12T16:00:00.000Z");
check("no date at all", parseLooseWhen("next Tuesday", "NYC"), null);
check("impossible month", parseLooseWhen("2026-13-01 7pm", "NYC"), null);
// The venue's digits must not be read as a time.
check("venue number ignored", iso(parseLooseWhen("dinner at 4 Charles on 2026-07-12 7pm", "NYC")), "2026-07-12T23:00:00.000Z");

// --- rendering back in the event's city ------------------------------------
const nycDinner = parseEventDate("2026-07-12T19:00", "NYC")!;
check("NYC renders 7 PM EDT", formatEventWhen(nycDinner, "NYC"), "Sunday, July 12 at 7:00 PM EDT");
const sfDinner = parseEventDate("2026-07-12T19:00", "SF")!;
check("SF renders 7 PM PDT", formatEventWhen(sfDinner, "SF"), "Sunday, July 12 at 7:00 PM PDT");
// The same instant read from the other coast is a different clock time, which
// is the whole point of storing UTC and rendering per city.
check("NYC dinner seen from SF", formatEventWhen(nycDinner, "SF"), "Sunday, July 12 at 4:00 PM PDT");
check("day only", formatEventDay(nycDinner, "NYC"), "Sun, July 12");

// A late West Coast dinner must not roll to the next day when rendered.
const sfLate = parseEventDate("2026-07-12T22:00", "SF")!;
check("late SF dinner stays on its own day", formatEventDay(sfLate, "SF", { month: "short", day: "numeric" }), "Jul 12");

// --- past/upcoming judged in the event's city ------------------------------
// 05:00Z on 13 July is already 1am on the 13th in New York, but still 10pm on
// the 12th in San Francisco. This is the case a server-local comparison got
// wrong: it retired the SF dinner while the table was still sitting.
const afterNycMidnight = new Date("2026-07-13T05:00:00Z");
check("SF dinner is not past during its own evening", isPastEvent(sfDinner, "SF", afterNycMidnight), false);
check("NYC dinner is past by then", isPastEvent(nycDinner, "NYC", afterNycMidnight), true);
check("tomorrow's dinner is not past", isPastEvent(parseEventDate("2026-07-14T19:00", "NYC")!, "NYC", afterNycMidnight), false);
// Earlier the same evening, neither has passed.
const duringBothEvenings = new Date("2026-07-13T02:00:00Z");
check("NYC dinner not past at 10pm its own time", isPastEvent(nycDinner, "NYC", duringBothEvenings), false);

if (failures > 0) {
  console.error(`\nevent time: ${failures} failing case(s)`);
  process.exit(1);
}
console.log("event time checks passed (zone parsing, DST, loose phrasing, rendering, past/upcoming)");
