// Production reset: wipe all demo/synthetic data, create the real operator
// (Jessica), and recreate the partner venues so the concierge can still book.
// Run once against the live Neon DB: `npx tsx scripts/prod-init.ts`.
import { prisma } from "../src/lib/prisma";

const TABLES = [
  "ConciergeMessage", "ConciergedThreadPlaceholder", "ConciergeThread", "Reference", "Note",
  "DinnerAttendee", "Dinner", "CoachingEngagement", "Vouch", "Referral", "Match",
  "VenueSlot", "Venue", "Photo", "Prompt", "Block", "Report", "Session", "LoginToken", "Person",
].filter((t) => t !== "ConciergedThreadPlaceholder");

const VENUES = [
  { city: "NYC", name: "Via Carota", area: "West Village", days: [[2, "19:00"], [3, "19:30"], [4, "20:00"]] },
  { city: "NYC", name: "The Long Island Bar", area: "Cobble Hill", days: [[1, "19:00"], [4, "19:00"], [5, "18:30"]] },
  { city: "SF", name: "Zuni Café", area: "Hayes Valley", days: [[2, "19:00"], [3, "19:30"], [4, "20:00"]] },
  { city: "SF", name: "Bar Crenn", area: "Cow Hollow", days: [[1, "19:00"], [4, "19:30"], [5, "19:00"]] },
] as const;

(async () => {
  console.log("Wiping all data in schema meetcute...");
  const list = TABLES.map((t) => `"meetcute"."${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);

  console.log("Creating operator: Jessica (jesswolflord@gmail.com)...");
  await prisma.person.create({
    data: {
      name: "Jessica Wolflord",
      email: "jesswolflord@gmail.com",
      city: "NYC",
      isOperator: true,
      isSuperAdmin: true,
      status: "active",
      headline: "Matchmaker",
    },
  });

  console.log("Recreating partner venues + held slots...");
  for (const v of VENUES) {
    await prisma.venue.create({
      data: {
        city: v.city, name: v.name, area: v.area, partner: true,
        slots: { create: v.days.map(([d, t]) => ({ dayOfWeek: d as number, time: t as string, held: true })) },
      },
    });
  }

  const counts = {
    people: await prisma.person.count(),
    operators: await prisma.person.count({ where: { isOperator: true } }),
    venues: await prisma.venue.count(),
  };
  console.log("Done:", counts);
  await prisma.$disconnect();
})();
