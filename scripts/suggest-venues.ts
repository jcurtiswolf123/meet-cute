// Ask the LLM for candidate venues, and land every one of them ineligible.
//
// This is the "keep the list updated with the LLM" half of date ideas, and it
// is deliberately the weaker half. The feature's whole safety property is that
// a model can never put a restaurant in front of a member: it may only return
// ids from a shortlist the database already holds (see src/lib/date-ideas.ts).
// Letting a model write rows into that table would reintroduce exactly the
// hallucination the design removes, one step upstream, where it looks
// authoritative because it is now "in the system".
//
// So the model proposes and a human disposes. Everything written here is
// `active: false, lastVerifiedAt: null`, which `eligibleVenues` excludes by
// construction, and lands in /studio/venues for review. A proposal is a lead to
// check, not a fact. The notes field says so on every row.
//
//   npx tsx scripts/suggest-venues.ts NYC              # propose for one city
//   npx tsx scripts/suggest-venues.ts NYC SF --count 8
//   npx tsx scripts/suggest-venues.ts NYC --dry-run    # print, write nothing
import { prisma } from "../src/lib/prisma";
import { copilotReply } from "../src/lib/ai";
import { VENUE_FRESH_DAYS } from "../src/lib/date-ideas";

const CITIES: Record<string, string> = { NYC: "New York City", SF: "San Francisco" };

type Proposal = {
  name: string;
  area?: string;
  cuisine?: string;
  priceBand?: string;
  goodFor?: string;
  why?: string;
};

const PRICE_BANDS = new Set(["$", "$$", "$$$", "$$$$"]);

function parseProposals(raw: string): Proposal[] {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  const list = (parsed as { venues?: unknown })?.venues;
  if (!Array.isArray(list)) return [];

  const out: Proposal[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const name = typeof v.name === "string" ? v.name.trim().slice(0, 120) : "";
    if (!name) continue;
    const str = (k: string, max: number) =>
      typeof v[k] === "string" && (v[k] as string).trim() ? (v[k] as string).trim().slice(0, max) : undefined;
    const price = str("priceBand", 4);
    out.push({
      name,
      area: str("area", 80),
      cuisine: str("cuisine", 80),
      priceBand: price && PRICE_BANDS.has(price) ? price : undefined,
      goodFor: str("goodFor", 160),
      why: str("why", 300),
    });
  }
  return out;
}

async function proposeFor(city: string, count: number, existing: string[]): Promise<Proposal[]> {
  const system = [
    "You suggest candidate restaurants and bars for a matchmaking service to consider for first dates.",
    "You are producing LEADS FOR A HUMAN TO VERIFY, not facts to publish. Nothing you say reaches a member.",
    "Suggest long-running, well-established places rather than new openings: the list is checked by hand and a place that has been open for years is likelier to still be there.",
    "Never invent an address, a phone number, a URL, or an opening time. Do not include any of those fields at all.",
    "Prefer places that work for a first date: easy to talk in, not a destination tasting menu, not a nightclub.",
    'Reply with JSON only, no prose and no code fences: {"venues":[{"name":"","area":"","cuisine":"","priceBand":"$|$$|$$$|$$$$","goodFor":"","why":""}]}',
    '"goodFor" is a short plain phrase a member could read, like "walk-ins welcome" or "quiet enough to talk".',
    '"why" is one sentence for the operator about why it suits a first date.',
    "No emoji. No em dashes.",
  ].join("\n");

  const user = [
    `City: ${CITIES[city] ?? city}.`,
    `Suggest ${count} candidates.`,
    existing.length
      ? `Already on the list, do not repeat these: ${existing.join(", ")}.`
      : "The list is currently empty.",
  ].join("\n");

  const res = await copilotReply(system, [{ role: "user", content: user }]);
  if (!res.live) {
    console.error(`  no AI provider answered (${res.provider}); nothing proposed for ${city}`);
    return [];
  }
  console.log(`  provider: ${res.provider}`);
  return parseProposals(res.text);
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const countIdx = argv.indexOf("--count");
  const count = countIdx >= 0 ? Math.min(Math.max(Number(argv[countIdx + 1]) || 6, 1), 12) : 6;
  const cities = argv.filter((a) => !a.startsWith("--") && CITIES[a.toUpperCase()]).map((a) => a.toUpperCase());

  if (!cities.length) {
    console.error(`Name at least one city: ${Object.keys(CITIES).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  for (const city of cities) {
    console.log(`\n${city}:`);
    const existing = await prisma.venue.findMany({ where: { city }, select: { name: true } });
    const proposals = await proposeFor(city, count, existing.map((v) => v.name));
    if (!proposals.length) {
      console.log("  nothing usable came back");
      continue;
    }

    // Case-insensitive, because "via carota" and "Via Carota" are the same room
    // and a duplicate row would show up twice in one email.
    const taken = new Set(existing.map((v) => v.name.trim().toLowerCase()));
    let written = 0;
    for (const p of proposals) {
      if (taken.has(p.name.toLowerCase())) {
        console.log(`  skip (already listed): ${p.name}`);
        continue;
      }
      taken.add(p.name.toLowerCase());
      const detail = [p.area, p.cuisine, p.priceBand].filter(Boolean).join(" · ");
      console.log(`  ${p.name}${detail ? ` (${detail})` : ""}`);
      if (p.why) console.log(`    ${p.why}`);
      if (dryRun) continue;

      await prisma.venue.create({
        data: {
          city,
          name: p.name,
          area: p.area ?? null,
          cuisine: p.cuisine ?? null,
          priceBand: p.priceBand ?? null,
          goodFor: p.goodFor ?? null,
          // The provenance stays on the row, because in three months nobody
          // will remember which names a human chose and which a model did.
          notes: [
            "Proposed by the LLM, NOT verified.",
            "Confirm the place is open and add the address and booking link before verifying.",
            p.why ? `Model's reasoning: ${p.why}` : null,
          ]
            .filter(Boolean)
            .join(" "),
          active: false,
          lastVerifiedAt: null,
        },
      });
      written += 1;
    }
    console.log(dryRun ? `  (dry run, nothing written)` : `  wrote ${written} unverified proposal(s)`);
  }

  console.log(
    [
      "",
      "Every proposal is inactive and unverified, so none of them can reach a member.",
      `Review them at /studio/venues. Verifying stamps a row eligible for ${VENUE_FRESH_DAYS} days.`,
    ].join("\n"),
  );
}

main()
  .catch((e) => {
    console.error("Error:", (e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
