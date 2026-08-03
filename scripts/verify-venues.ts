// Keep the venue list honest.
//
// A suggestion is only eligible while it is active AND was verified inside
// VENUE_FRESH_DAYS, so this script is what actually switches the date-ideas
// feature on and keeps it on. Nothing is auto-verified: a human confirms the
// place is open and the booking link still resolves, then stamps it.
//
//   npx tsx scripts/verify-venues.ts                       # status report
//   npx tsx scripts/verify-venues.ts --stale               # only what expired
//   npx tsx scripts/verify-venues.ts --check               # test booking URLs
//   npx tsx scripts/verify-venues.ts --verify <id> [...]   # stamp as verified
//   npx tsx scripts/verify-venues.ts --retire <id> [...]   # mark inactive
//
// --check fetches each booking URL and reports what came back. That catches a
// dead link, which is the cheap half of the problem. It cannot tell you a
// restaurant closed while its website stayed up, which is why the stamp is
// deliberately a human action rather than something this script infers.
import { prisma } from "../src/lib/prisma";
import { VENUE_FRESH_DAYS } from "../src/lib/date-ideas";

const DAY = 24 * 3600 * 1000;

function ageDays(d: Date | null): number | null {
  return d ? Math.floor((Date.now() - d.getTime()) / DAY) : null;
}

async function checkUrl(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, { redirect: "follow", signal: ctrl.signal });
    return res.ok ? `ok ${res.status}` : `HTTP ${res.status}`;
  } catch (e) {
    return `unreachable (${(e as Error).name})`;
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  const argv = process.argv.slice(2);
  const ids = (flag: string) => {
    const i = argv.indexOf(flag);
    if (i < 0) return [];
    const out: string[] = [];
    for (let j = i + 1; j < argv.length && !argv[j].startsWith("--"); j++) out.push(argv[j]);
    return out;
  };

  const toVerify = ids("--verify");
  if (toVerify.length) {
    const r = await prisma.venue.updateMany({
      where: { id: { in: toVerify } },
      data: { lastVerifiedAt: new Date(), active: true },
    });
    console.log(`Verified ${r.count} venue(s). They are eligible for ${VENUE_FRESH_DAYS} days.`);
  }

  const toRetire = ids("--retire");
  if (toRetire.length) {
    const r = await prisma.venue.updateMany({ where: { id: { in: toRetire } }, data: { active: false } });
    console.log(`Retired ${r.count} venue(s). They will not be suggested again.`);
  }

  const venues = await prisma.venue.findMany({ orderBy: [{ city: "asc" }, { name: "asc" }] });
  const cutoff = new Date(Date.now() - VENUE_FRESH_DAYS * DAY);
  const staleOnly = argv.includes("--stale");
  const doCheck = argv.includes("--check");

  let eligible = 0;
  console.log(`\nVenues (${venues.length}). Eligible means active and verified inside ${VENUE_FRESH_DAYS} days.\n`);
  for (const v of venues) {
    const fresh = Boolean(v.lastVerifiedAt && v.lastVerifiedAt >= cutoff);
    const ok = v.active && fresh;
    if (ok) eligible++;
    if (staleOnly && ok) continue;

    const age = ageDays(v.lastVerifiedAt);
    const state = !v.active ? "RETIRED" : fresh ? "eligible" : v.lastVerifiedAt ? "STALE" : "NEVER VERIFIED";
    console.log(`${state.padEnd(15)} ${v.city.padEnd(4)} ${v.name}`);
    console.log(`   id=${v.id}${age === null ? "" : `  verified ${age}d ago`}`);
    if (!v.bookingUrl && !v.mapsUrl) console.log(`   no booking or map link, so the email can only name it`);
    if (doCheck && v.bookingUrl) console.log(`   bookingUrl: ${await checkUrl(v.bookingUrl)}`);
  }

  console.log(`\n${eligible} of ${venues.length} eligible to suggest right now.`);
  if (eligible === 0) {
    console.log(
      "No venue is eligible, so the connection email omits the ideas block entirely.\n" +
        "That is the intended safe default: verify venues before members see them.",
    );
  }
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("Error:", (e as Error).message);
  await prisma.$disconnect();
  process.exitCode = 1;
});
