// Regression test for the 18+ gate.
//
// The gate used to be floor((Date.now() - birthdate) / (365.25 days)). Eighteen
// calendar years is usually 6574 days while 365.25 * 18 is 6574.5, so the
// quotient was still 17 through most of someone's actual eighteenth birthday:
// applying at 2am Pacific was refused and applying that evening was accepted.
// These cases pin the calendar-based replacement.

import { calendarAge, parseCalendarDate, maxBirthdateForAge } from "../src/lib/age";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function age(birthdate: string, on: string): number {
  const parts = parseCalendarDate(birthdate);
  if (!parts) throw new Error(`unparseable birthdate ${birthdate}`);
  const [y, m, d] = on.split("-").map(Number);
  return calendarAge(parts, new Date(y, m - 1, d));
}

// The exact case the old arithmetic got wrong: eighteen today, any time of day.
check("18th birthday is 18", age("2008-08-02", "2026-08-02"), 18);
check("day before 18th is 17", age("2008-08-03", "2026-08-02"), 17);
check("day after 18th is 18", age("2008-08-01", "2026-08-02"), 18);

// Leap-day birthdays: 29 Feb turns 18 on 1 March in a non-leap year.
check("leap birthday, 28 Feb, still 17", age("2008-02-29", "2026-02-28"), 17);
check("leap birthday, 1 Mar, now 18", age("2008-02-29", "2026-03-01"), 18);

// Month boundaries.
check("birthday later this month", age("2008-08-20", "2026-08-02"), 17);
check("birthday earlier this year", age("2008-01-20", "2026-08-02"), 18);
check("birthday later this year", age("2008-12-20", "2026-08-02"), 17);

// Comfortably over and comfortably under.
check("forty year old", age("1986-05-05", "2026-08-02"), 40);
check("ten year old", age("2016-05-05", "2026-08-02"), 10);

// parseCalendarDate rejects what is not a real calendar date.
check("rejects 30 Feb", parseCalendarDate("2025-02-30"), null);
check("rejects month 13", parseCalendarDate("2025-13-01"), null);
check("rejects empty", parseCalendarDate(""), null);
check("rejects free text", parseCalendarDate("not a date"), null);
check("accepts a real date", parseCalendarDate("2008-08-02"), { y: 2008, m: 8, d: 2 });
check("accepts a leap day", parseCalendarDate("2008-02-29"), { y: 2008, m: 2, d: 29 });

// The form max is the birthdate that is exactly 18 today, in local calendar
// terms. toISOString() used to shift this a day for anyone west of Greenwich.
check("form max is 18 years ago today", maxBirthdateForAge(18, new Date(2026, 7, 2)), "2008-08-02");
check("form max pads single digits", maxBirthdateForAge(18, new Date(2026, 0, 5)), "2008-01-05");

// The form max must itself pass the gate, or the widget would offer a date the
// server then rejects.
const maxParts = parseCalendarDate(maxBirthdateForAge(18, new Date(2026, 7, 2)));
check("form max passes the gate", calendarAge(maxParts!, new Date(2026, 7, 2)), 18);

if (failures > 0) {
  console.error(`\nage gate: ${failures} failing case(s)`);
  process.exit(1);
}
console.log("age gate checks passed (18th birthday, leap days, month boundaries, form max)");
