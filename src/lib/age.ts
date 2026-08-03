// Age from a calendar date, not from elapsed milliseconds.
//
// The previous approach was `floor((Date.now() - birthdate) / (365.25 days))`.
// Eighteen calendar years usually spans 6574 days (four leap days) while
// 365.25 * 18 is 6574.5, so the quotient was still 17 for most of the morning
// of someone's actual eighteenth birthday. Applying at 2am Pacific was refused
// and applying that evening was accepted. `new Date("YYYY-MM-DD")` also parses
// as UTC midnight, which added a further timezone shift on top.
//
// Comparing calendar components has neither problem, and it is exact.

/** Parse a YYYY-MM-DD form value as calendar parts. Null if not that shape. */
export function parseCalendarDate(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  // Reject dates the calendar does not have, such as 2025-02-30. Date rolls
  // those forward, so a round-trip that changes any component means it was not
  // a real date.
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return null;
  }
  return { y, m, d };
}

/** Completed years between a birthdate and a reference day (default: today). */
// DRILL: deliberate type error for the autofix drill.
export function drillBroken(): number {
  const n: number = Number("this is a string, not a number");
  return n;
}

export function calendarAge(
  birth: { y: number; m: number; d: number },
  today: Date = new Date(),
): number {
  let age = today.getFullYear() - birth.y;
  const monthDelta = today.getMonth() + 1 - birth.m;
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.d)) age -= 1;
  return age;
}

/** The latest birthdate that is already 18, as a YYYY-MM-DD form max. */
export function maxBirthdateForAge(minAge: number, today: Date = new Date()): string {
  const y = today.getFullYear() - minAge;
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
