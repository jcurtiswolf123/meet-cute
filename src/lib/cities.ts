// The markets Mutuals runs in, in one place.
//
// City was a bare string compared against the literals "SF" and "NYC" in
// sixteen files, with the display name derived by a ternary in three of them
// and "anything that is not SF" meaning New York everywhere else. Adding a
// third market that way would have meant finding all of them and getting every
// one right, and the first one missed would have quietly filed an Angeleno in
// New York.
//
// A member can also be in two of them. People who split time between San
// Francisco and Los Angeles were picking one and hoping, which makes them
// invisible to the matchmaker in the other half of their life.

export const CITIES = [
  { value: "NYC", label: "New York", short: "NYC" },
  { value: "SF", label: "San Francisco", short: "SF" },
  { value: "LA", label: "Los Angeles", short: "LA" },
] as const;

export type City = (typeof CITIES)[number]["value"];

const BY_VALUE = new Map(CITIES.map((city) => [city.value, city]));

export function isCity(value: string | null | undefined): value is City {
  return !!value && BY_VALUE.has(value as City);
}

/**
 * The stored value for whatever a form, an import, or an older row supplies.
 *
 * Existing rows hold "NYC" and "SF"; the studio forms have historically posted
 * the display name "San Francisco" for SF, and that is still what the operator
 * team form sends. Both have to land on the same city rather than on the
 * default, which is how a member ends up in the wrong market.
 */
export function normalizeCity(value: string | null | undefined, fallback: City = "NYC"): City {
  const raw = String(value ?? "").trim();
  if (isCity(raw)) return raw;
  const lower = raw.toLowerCase();
  if (lower.includes("francisco") || lower === "bay area") return "SF";
  if (lower.includes("angeles") || lower === "los angeles") return "LA";
  if (lower.includes("york")) return "NYC";
  return fallback;
}

/** "San Francisco". Full name, for copy a member reads. */
export function cityLabel(value: string | null | undefined): string {
  return BY_VALUE.get(normalizeCity(value))?.label ?? "New York";
}

/** "SF". Short form, for tables and pills where space is the constraint. */
export function cityShort(value: string | null | undefined): string {
  return BY_VALUE.get(normalizeCity(value))?.short ?? "NYC";
}

type Placed = { city: string; secondCity?: string | null };

/** Every market this person is actually in, primary first, never duplicated. */
export function citiesOf(person: Placed): City[] {
  const primary = normalizeCity(person.city);
  const second = person.secondCity ? normalizeCity(person.secondCity) : null;
  return second && second !== primary ? [primary, second] : [primary];
}

/** "New York and Los Angeles", or just "New York". */
export function citiesLabel(person: Placed): string {
  const [first, second] = citiesOf(person);
  return second ? `${cityLabel(first)} and ${cityLabel(second)}` : cityLabel(first);
}

/**
 * Whether two people share a market.
 *
 * Introductions happen inside one city, and someone who splits their time is
 * introducible in both. This is the whole reason a second city exists, so it
 * is the one comparison every matching surface must use rather than `a.city
 * === b.city`.
 */
export function sharesCity(a: Placed, b: Placed): boolean {
  const theirs = new Set(citiesOf(b));
  return citiesOf(a).some((city) => theirs.has(city));
}

/** Prisma `where` fragment matching anyone in this market, either slot. */
export function cityWhere(value: string | null | undefined) {
  const city = normalizeCity(value);
  return { OR: [{ city }, { secondCity: city }] };
}
