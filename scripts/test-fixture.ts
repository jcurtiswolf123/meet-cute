// Seed a self-contained test scenario on the live DB so you can walk the full
// flow: two members and one curated suggestion between them, reset to a clean
// "both undecided" state each run. Idempotent.
//
//   npx tsx scripts/test-fixture.ts
//
// Test accounts use @meetcute.test emails so they are easy to spot and remove.
import { prisma } from "../src/lib/prisma";

function avatar(seed: string) {
  return `https://i.pravatar.cc/480?u=${encodeURIComponent(seed)}`;
}

type Spec = {
  email: string; name: string; city: "NYC" | "SF"; age: number; gender: string;
  seeking: string; neighborhood: string; headline: string; bio: string;
  lookingFor: string; dealBreakers: string; prompts: [string, string][];
};

const MAYA: Spec = {
  email: "maya@meetcute.test", name: "Maya Rosen", city: "NYC", age: 29, gender: "woman", seeking: "man",
  neighborhood: "West Village", headline: "Cookbook editor who runs on espresso and long walks",
  bio: "I edit cookbooks for a living, so I have strong and unsolicited opinions about your pasta water. Half-marathoner, terrible at chess, very good at planning trips.",
  lookingFor: "Someone curious and kind who reads actual books and wants a real partnership.",
  dealBreakers: "Smoking, and people who are rude to waiters.",
  prompts: [
    ["The way to my heart is", "a perfect roast chicken and a plan for the weekend."],
    ["I geek out on", "regional Italian food and old New Yorker essays."],
  ],
};

const ALEX: Spec = {
  email: "alex@meetcute.test", name: "Alex Chen", city: "NYC", age: 31, gender: "man", seeking: "woman",
  neighborhood: "Fort Greene", headline: "Architect who cooks, climbs, and overthinks playlists",
  bio: "I design schools and libraries. Weekends are climbing, the farmers market, and pretending I'll finally fix my road bike. Looking for someone with their own thing going on.",
  lookingFor: "A real partner — ambitious but warm, up for a Tuesday adventure as much as a quiet Sunday.",
  dealBreakers: "Flakiness, and anyone who won't try the tasting menu.",
  prompts: [
    ["We'll get along if", "you have a restaurant list and strong opinions about it."],
    ["My simple pleasure is", "a negroni and a 7am climb before the gym fills up."],
  ],
};

async function upsertMember(s: Spec) {
  const person = await prisma.person.upsert({
    where: { email: s.email },
    update: {
      name: s.name, city: s.city, age: s.age, gender: s.gender, seeking: s.seeking,
      neighborhood: s.neighborhood, headline: s.headline, bio: s.bio,
      lookingFor: s.lookingFor, dealBreakers: s.dealBreakers, status: "active",
    },
    create: {
      email: s.email, name: s.name, city: s.city, age: s.age, gender: s.gender, seeking: s.seeking,
      neighborhood: s.neighborhood, headline: s.headline, bio: s.bio,
      lookingFor: s.lookingFor, dealBreakers: s.dealBreakers, status: "active",
    },
  });
  // Reset photos + prompts so reruns stay clean.
  await prisma.photo.deleteMany({ where: { personId: person.id } });
  await prisma.prompt.deleteMany({ where: { personId: person.id } });
  await prisma.photo.create({
    data: { personId: person.id, url: avatar(s.email), order: 0, status: "approved" },
  });
  await prisma.prompt.createMany({
    data: s.prompts.map(([question, answer], i) => ({ personId: person.id, question, answer, order: i })),
  });
  return person;
}

(async () => {
  try {
    const operator = await prisma.person.findFirst({ where: { isOperator: true } });
    const maya = await upsertMember(MAYA);
    const alex = await upsertMember(ALEX);

    // One curated suggestion, reset to a clean undecided state each run.
    const rationale =
      "You're both builders who treat food as the main event — Maya edits cookbooks, Alex plans his week around the farmers market. Similar ambition, complementary energy (her planning, his spontaneity), and neither suffers flakiness. Worth a dinner.";
    const existing = await prisma.match.findFirst({
      where: {
        OR: [
          { personAId: maya.id, personBId: alex.id },
          { personAId: alex.id, personBId: maya.id },
        ],
      },
    });
    if (existing) {
      // Clear any downstream concierge state from a previous test, then reset.
      await prisma.conciergeThread.deleteMany({ where: { matchId: existing.id } });
      await prisma.match.update({
        where: { id: existing.id },
        data: { stage: "suggested", aDecision: "pending", bDecision: "pending", rationale, exitReason: null, stalledReason: null },
      });
    } else {
      await prisma.match.create({
        data: {
          personAId: maya.id, personBId: alex.id, stage: "suggested",
          aDecision: "pending", bDecision: "pending", rationale,
          createdById: operator?.id,
        },
      });
    }

    console.log("Test fixture ready:");
    console.log(`  operator: ${operator?.name} <${operator?.email}>`);
    console.log(`  member A: ${maya.name} <${maya.email}>`);
    console.log(`  member B: ${alex.name} <${alex.email}>`);
    console.log("  match:    Maya <-> Alex (suggested, both undecided)");
    console.log("\nGet sign-in links: npx tsx scripts/login-link.ts <email>");
  } catch (e) {
    console.error("Error:", (e as Error).message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
