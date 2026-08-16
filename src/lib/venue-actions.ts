"use server";

// Operator actions for the venue list that feeds the connection email's
// suggestions.
//
// The one rule this file exists to hold: a venue becomes eligible ONLY when a
// human stamps it. Nothing here infers verification, and nothing an LLM writes
// arrives verified. `scripts/suggest-venues.ts` proposes candidates as inactive
// and unverified precisely so they land in the review queue rather than in a
// member's inbox.
import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { requireOperator } from "./auth";

const CITIES = new Set(["NYC", "SF"]);
const PRICE_BANDS = new Set(["$", "$$", "$$$", "$$$$"]);

function clean(form: FormData, key: string, max = 240): string | null {
  const value = String(form.get(key) ?? "").trim().slice(0, max);
  return value || null;
}

/** Only http(s) is ever stored. These strings end up as anchors in an email to
 *  two other people, so a `javascript:` value must not survive the form. The
 *  renderer checks again; this stops it reaching the database at all. */
function cleanUrl(form: FormData, key: string): string | null {
  const raw = clean(form, key, 500);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function refresh() {
  revalidatePath("/studio/events");
}

export async function saveVenue(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");

  const id = String(formData.get("venueId") || "").trim();
  const name = clean(formData, "name", 120);
  if (!name) throw new Error("A venue needs a name.");

  const cityRaw = String(formData.get("city") || "NYC").trim().toUpperCase();
  const city = CITIES.has(cityRaw) ? cityRaw : "NYC";

  const priceRaw = String(formData.get("priceBand") || "").trim();
  const priceBand = PRICE_BANDS.has(priceRaw) ? priceRaw : null;

  const data = {
    name,
    city,
    area: clean(formData, "area", 80),
    address: clean(formData, "address", 200),
    cuisine: clean(formData, "cuisine", 80),
    priceBand,
    goodFor: clean(formData, "goodFor", 160),
    notes: clean(formData, "notes", 2000),
    bookingUrl: cleanUrl(formData, "bookingUrl"),
    mapsUrl: cleanUrl(formData, "mapsUrl"),
  };

  if (id) {
    // Editing the facts does NOT re-verify. Someone fixing a typo is not
    // someone who rang the restaurant, and conflating the two is how a closed
    // room stays eligible for another 120 days.
    await prisma.venue.update({ where: { id }, data });
  } else {
    // New rows start ineligible on purpose, whoever created them.
    await prisma.venue.create({ data: { ...data, active: false, lastVerifiedAt: null } });
  }
  refresh();
}

/** The human stamp. This is the only thing in the codebase that makes a venue
 *  eligible to be put in front of a member. */
export async function verifyVenue(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const id = String(formData.get("venueId") || "").trim();
  if (!id) return;
  await prisma.venue.update({
    where: { id },
    data: { lastVerifiedAt: new Date(), active: true },
  });
  refresh();
}

export async function retireVenue(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const id = String(formData.get("venueId") || "").trim();
  if (!id) return;
  await prisma.venue.update({ where: { id }, data: { active: false } });
  refresh();
}

/** Delete a proposal outright. Only ever offered for rows that were never
 *  verified, so a venue with history behind it cannot be lost by a stray click:
 *  retiring is the reversible way to stop suggesting an established room. */
export async function discardVenue(formData: FormData) {
  const op = await requireOperator();
  if (!op) throw new Error("operators only");
  const id = String(formData.get("venueId") || "").trim();
  if (!id) return;
  const venue = await prisma.venue.findUnique({
    where: { id },
    select: { lastVerifiedAt: true, _count: { select: { picks: true, threads: true } } },
  });
  if (!venue) return;
  if (venue.lastVerifiedAt || venue._count.picks > 0 || venue._count.threads > 0) {
    throw new Error("This venue has history. Retire it instead of deleting it.");
  }
  await prisma.venue.delete({ where: { id } });
  refresh();
}
