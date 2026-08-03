// Event times are wall-clock times in the city the dinner happens in.
//
// Before this, both ends of an event date were implicitly server-local. On Fly
// that is UTC, so an operator typing "Via Carota, 7pm" stored 19:00Z (3pm in
// New York) and every surface then rendered it back in UTC, which hid the error
// locally and only broke the actual reservation. The ICS attachment, which is
// genuinely absolute, put the dinner at 3pm on the member's calendar.
//
// So: parse in the city's zone, render in the city's zone, store UTC. No
// dependency, just Intl, which ships the full IANA database in Node 22.

const ZONES: Record<string, string> = {
  NYC: "America/New_York",
  SF: "America/Los_Angeles",
};

const DEFAULT_ZONE = ZONES.NYC;

export function eventZone(city: string | null | undefined): string {
  return ZONES[(city ?? "").toUpperCase()] ?? DEFAULT_ZONE;
}

/** How far the zone is from UTC at this instant, in milliseconds. */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  ) as Record<string, string>;
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asIfUtc - at.getTime();
}

/**
 * Read an operator-supplied date as local time in the event's city.
 *
 * Accepts a naive ISO-ish string ("2026-07-12T19:00", "2026-07-12 19:00"),
 * which is what both the co-pilot and the studio form produce, and treats it as
 * that city's wall clock. A string that already carries an explicit offset or a
 * trailing Z is absolute and is passed straight through.
 *
 * Returns null when the input is not a date at all, so callers can refuse
 * rather than write an Invalid Date.
 */
export function parseEventDate(input: string, city: string | null | undefined): Date | null {
  const raw = input.trim();
  if (!raw) return null;

  const hasExplicitOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  if (hasExplicitOffset) {
    const absolute = new Date(raw);
    return Number.isNaN(absolute.getTime()) ? null : absolute;
  }

  const naive = raw.replace(" ", "T");
  // Interpret the wall clock as if it were UTC, then subtract the zone's real
  // offset. The offset itself depends on the instant, so this resolves twice:
  // the first pass lands within an hour, the second settles DST boundaries.
  const asIfUtc = new Date(`${naive}${/\d{2}:\d{2}/.test(naive) ? "" : "T00:00"}Z`);
  if (Number.isNaN(asIfUtc.getTime())) {
    const loose = new Date(raw);
    return Number.isNaN(loose.getTime()) ? null : loose;
  }

  const zone = eventZone(city);
  const firstPass = new Date(asIfUtc.getTime() - zoneOffsetMs(asIfUtc, zone));
  const settled = new Date(asIfUtc.getTime() - zoneOffsetMs(firstPass, zone));
  return settled;
}

/**
 * Render an event time in its own city, with the zone abbreviation, because a
 * dinner invitation that says "7:00 PM" without saying where is a missed table.
 */
export function formatEventWhen(date: Date, city: string | null | undefined): string {
  return date.toLocaleString("en-US", {
    timeZone: eventZone(city),
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** Short form for dense surfaces (studio lists, archive rows). */
export function formatEventDay(
  date: Date,
  city: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "long", day: "numeric" }
): string {
  return date.toLocaleDateString("en-US", { timeZone: eventZone(city), ...opts });
}

/**
 * Read a date out of free operator text, in the event's city.
 *
 * The deterministic command path used to hand the whole phrase to `new Date`,
 * which cannot parse "7pm" at all, so the co-pilot's own documented example
 * ("create a NYC dinner at Via Carota on 2026-07-12 7pm") always failed. This
 * pulls the calendar date and the clock time out separately.
 *
 * Handles: 2026-07-12, 2026/07/12, 7/12/2026, with an optional 7pm, 7:30 pm,
 * 19:00, or "at 7". Defaults to 19:00 when a date is given with no time, which
 * is when these dinners start.
 */
export function parseLooseWhen(text: string, city: string | null | undefined): Date | null {
  const s = text.trim();

  const iso = s.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  const us = iso ? null : s.match(/\b(\d{1,2})[/](\d{1,2})[/](\d{4})\b/);
  if (!iso && !us) return null;

  const year = Number(iso ? iso[1] : us![3]);
  const month = Number(iso ? iso[2] : us![1]);
  const day = Number(iso ? iso[3] : us![2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  let hour = 19;
  let minute = 0;
  // Look for a clock time in the part of the string after the date, so the
  // date's own digits cannot be mistaken for a time.
  const tail = s.slice((iso ?? us)!.index! + (iso ?? us)![0].length);
  const clock = tail.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) ?? tail.match(/\b(\d{1,2}):(\d{2})\b/);
  if (clock) {
    hour = Number(clock[1]);
    minute = Number(clock[2] ?? 0);
    const meridiem = clock[3]?.toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) return null;
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  return parseEventDate(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`, city);
}

/** Has this event's evening passed, judged in the event's own city? */
export function isPastEvent(date: Date, city: string | null | undefined, now = new Date()): boolean {
  const zone = eventZone(city);
  const dayOf = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: zone }); // YYYY-MM-DD
  return dayOf(date) < dayOf(now);
}
