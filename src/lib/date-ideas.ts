// Where two people who just said yes should actually go.
//
// The whole design exists to answer one question safely: how do you put a
// restaurant in front of a member without ever naming one that closed, moved, or
// never existed? An LLM asked "suggest three places in the West Village" answers
// confidently and is sometimes wrong, and this copy lands in the highest-trust
// message the product sends. A wrong name here is not a typo, it is two people
// standing outside a shuttered door.
//
// So facts and voice are split:
//
//   - Every venue fact (name, neighbourhood, address, booking link) comes from
//     the Venue table. The model never writes one.
//   - The LLM receives a shortlist and may only return IDs FROM THAT LIST plus
//     one line of reasoning each. Any id it invents is not found in the map and
//     is dropped. Hallucinating a venue is therefore impossible rather than
//     unlikely.
//   - The one free-text field the model fully authors is `wildcard`, a non-venue
//     idea ("a walk over the bridge, then coffee"). It names no facts, so there
//     is nothing there to be wrong about.
//
// Freshness is enforced the same way: a venue is only eligible if it is active
// and was verified inside VENUE_FRESH_DAYS. Stale rows silently leave the
// shortlist rather than being emailed. scripts/verify-venues.ts stamps them.
//
// Finally, this is decoration on the most important email in the product. Every
// path degrades: no venues -> no block, LLM slow or down -> deterministic
// ranking, everything broken -> the email sends exactly as it did before.
import type { Prisma, Venue } from "@prisma/client";
import { prisma } from "./prisma";
import { copilotReply } from "./ai";

/** A venue is only suggested if it was verified this recently. A restaurant
 *  that closed is worse than no suggestion, so the default is deliberately
 *  short and unverified rows (lastVerifiedAt null) never qualify. */
export const VENUE_FRESH_DAYS = Number(process.env.MUTUALS_VENUE_FRESH_DAYS) || 120;

/** Ideas are an enhancement on a message that must always send, so the model
 *  gets a tighter budget than the co-pilot chat. On timeout we rank locally. */
const IDEAS_TIMEOUT_MS = Number(process.env.MUTUALS_IDEAS_TIMEOUT_MS) || 6_000;

const MAX_SUGGESTIONS = 3;

export type DateIdea = {
  venueId: string;
  name: string;
  area: string | null;
  cuisine: string | null;
  priceBand: string | null;
  address: string | null;
  bookingUrl: string | null;
  mapsUrl: string | null;
  /** One line on why these two, specifically. Written by the model when it is
   *  reachable, and by a plain template when it is not. Never contains a fact
   *  that is not already in the columns above. */
  why: string;
};

export type DateIdeas = {
  ideas: DateIdea[];
  /** A non-venue suggestion. Free text, names nothing checkable. */
  wildcard: string | null;
  /** True when a live model wrote the copy. Used by tests and the studio, never
   *  shown to members. */
  live: boolean;
};

export const NO_IDEAS: DateIdeas = { ideas: [], wildcard: null, live: false };

type PersonLike = {
  name: string;
  city?: string | null;
  neighborhood?: string | null;
  bio?: string | null;
  lookingFor?: string | null;
};

/** Venues that may be shown to a member right now. Anything inactive, or not
 *  verified inside the freshness window, is excluded here rather than filtered
 *  downstream, so no later code path can accidentally surface a stale row. */
export async function eligibleVenues(city: string, db: Prisma.TransactionClient | typeof prisma = prisma): Promise<Venue[]> {
  const cutoff = new Date(Date.now() - VENUE_FRESH_DAYS * 24 * 3600 * 1000);
  return db.venue.findMany({
    where: { city, active: true, lastVerifiedAt: { gte: cutoff } },
    orderBy: [{ partner: "desc" }, { name: "asc" }],
  });
}

function firstName(name: string): string {
  return (name || "").trim().split(/\s+/)[0] || name;
}

/** Deterministic ranking, used when no model is reachable and to choose the
 *  shortlist the model is allowed to pick from. Prefers a venue in either
 *  person's own neighbourhood, then a partner room, then alphabetical so the
 *  result is stable rather than arbitrary. */
export function rankVenues(venues: Venue[], a: PersonLike, b: PersonLike): Venue[] {
  const hoods = [a.neighborhood, b.neighborhood]
    .filter((h): h is string => Boolean(h && h.trim()))
    .map((h) => h.trim().toLowerCase());
  return [...venues].sort((x, y) => {
    const hx = x.area && hoods.includes(x.area.trim().toLowerCase()) ? 1 : 0;
    const hy = y.area && hoods.includes(y.area.trim().toLowerCase()) ? 1 : 0;
    if (hx !== hy) return hy - hx;
    if (x.partner !== y.partner) return Number(y.partner) - Number(x.partner);
    return x.name.localeCompare(y.name);
  });
}

function toIdea(v: Venue, why: string): DateIdea {
  return {
    venueId: v.id,
    name: v.name,
    area: v.area,
    cuisine: v.cuisine,
    priceBand: v.priceBand,
    address: v.address,
    bookingUrl: v.bookingUrl,
    mapsUrl: v.mapsUrl,
    why,
  };
}

/** The line used when no model wrote one. Deliberately built only from columns
 *  that are already on the row, so it can state nothing that is not true. */
export function fallbackWhy(v: Venue): string {
  const bits = [v.goodFor?.trim(), v.cuisine?.trim() ? `${v.cuisine.trim()}` : null, v.area?.trim() ? `in ${v.area.trim()}` : null]
    .filter(Boolean)
    .join(", ");
  return bits ? `${bits}.` : `An easy place to talk.`;
}

/** Parse a model reply into ideas, keeping ONLY ids present in `allowed`.
 *
 *  This is the security boundary of the whole feature, so it is a pure function
 *  and is tested directly. Anything the model invents, mangles, or wraps in
 *  prose is discarded rather than repaired: a dropped suggestion costs nothing,
 *  an invented restaurant costs a member their evening. */
export function parseIdeaReply(raw: string, allowed: Map<string, Venue>): { ideas: DateIdea[]; wildcard: string | null } {
  const empty = { ideas: [], wildcard: null };
  if (!raw?.trim()) return empty;

  // Models wrap JSON in prose or fences often enough that pulling the outermost
  // object is worth it. Anything unparseable falls back to no ideas.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return empty;
  }
  if (!parsed || typeof parsed !== "object") return empty;

  const obj = parsed as { picks?: unknown; wildcard?: unknown };
  const ideas: DateIdea[] = [];
  const seen = new Set<string>();

  if (Array.isArray(obj.picks)) {
    for (const item of obj.picks) {
      if (!item || typeof item !== "object") continue;
      const { id, why } = item as { id?: unknown; why?: unknown };
      if (typeof id !== "string") continue;
      const venue = allowed.get(id.trim());
      // The invented-id case. Not an error, just not shown.
      if (!venue || seen.has(venue.id)) continue;
      seen.add(venue.id);
      const line = typeof why === "string" ? why.trim().replace(/\s+/g, " ").slice(0, 180) : "";
      ideas.push(toIdea(venue, line || fallbackWhy(venue)));
      if (ideas.length >= MAX_SUGGESTIONS) break;
    }
  }

  const wildcardRaw = typeof obj.wildcard === "string" ? obj.wildcard.trim().replace(/\s+/g, " ") : "";
  return { ideas, wildcard: wildcardRaw ? wildcardRaw.slice(0, 240) : null };
}

function buildPrompt(shortlist: Venue[], a: PersonLike, b: PersonLike) {
  const system =
    "You help a matchmaking service suggest where two people should meet for a first date. " +
    "You are given a fixed list of venues. You may ONLY reference venues from that list, by id. " +
    "Never invent a venue, an address, a price, or an opening time. " +
    "Never state a table is booked or held: nothing is reserved. " +
    "Reply with JSON only, no prose and no code fences, shaped exactly: " +
    '{"picks":[{"id":"<id from the list>","why":"<one short sentence>"}],"wildcard":"<one non-restaurant idea>"} ' +
    `Choose at most ${MAX_SUGGESTIONS} picks. Each "why" is one sentence under 20 words about why THESE TWO would like it, ` +
    "grounded only in the venue details given and what the two people said about themselves. " +
    'The "wildcard" is a short first-date idea that names no specific business. ' +
    "No emoji. No em dashes. Warm and plain, not salesy.";

  const venueLines = shortlist
    .map((v) =>
      [
        `id: ${v.id}`,
        `name: ${v.name}`,
        v.area && `area: ${v.area}`,
        v.cuisine && `cuisine: ${v.cuisine}`,
        v.priceBand && `price: ${v.priceBand}`,
        v.goodFor && `good for: ${v.goodFor}`,
      ]
        .filter(Boolean)
        .join(" | "),
    )
    .join("\n");

  const person = (p: PersonLike) =>
    [
      `name: ${firstName(p.name)}`,
      p.neighborhood && `neighbourhood: ${p.neighborhood}`,
      p.bio && `about: ${p.bio.slice(0, 400)}`,
      p.lookingFor && `looking for: ${p.lookingFor.slice(0, 300)}`,
    ]
      .filter(Boolean)
      .join(" | ");

  const user =
    `Venues you may choose from:\n${venueLines}\n\n` +
    `Person one: ${person(a)}\n` +
    `Person two: ${person(b)}\n\n` +
    "Pick the best places for these two and reply with the JSON described.";

  return { system, user };
}

/** Best-effort date ideas for a connected pair.
 *
 *  Never throws and never blocks for long: the caller is assembling the
 *  connection email, which must go out even if every provider is down. */
export async function dateIdeasFor(args: {
  city?: string | null;
  a: PersonLike;
  b: PersonLike;
}): Promise<DateIdeas> {
  const city = (args.city || args.a.city || args.b.city || "").trim();
  if (!city) return NO_IDEAS;

  let venues: Venue[];
  try {
    venues = await eligibleVenues(city);
  } catch {
    return NO_IDEAS;
  }
  if (venues.length === 0) return NO_IDEAS;

  // The model only ever sees, and can only ever return, this shortlist.
  const shortlist = rankVenues(venues, args.a, args.b).slice(0, 8);
  const allowed = new Map(shortlist.map((v) => [v.id, v]));

  const deterministic: DateIdeas = {
    ideas: shortlist.slice(0, MAX_SUGGESTIONS).map((v) => toIdea(v, fallbackWhy(v))),
    wildcard: null,
    live: false,
  };

  const { system, user } = buildPrompt(shortlist, args.a, args.b);
  let raw = "";
  try {
    const result = await Promise.race([
      copilotReply(system, [{ role: "user", content: user }]),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), IDEAS_TIMEOUT_MS)),
    ]);
    if (!result || !result.live) return deterministic;
    raw = result.text;
  } catch {
    return deterministic;
  }

  const { ideas, wildcard } = parseIdeaReply(raw, allowed);
  // A model that returned nothing usable is the same as a model that was down.
  if (ideas.length === 0) return { ...deterministic, wildcard };
  return { ideas, wildcard, live: true };
}
