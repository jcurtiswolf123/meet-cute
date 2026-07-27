// Local-only QA seeder. Builds a realistic dataset so every surface renders a
// populated state instead of an empty one: operators, applicants, active
// members, a live match, dinners with attendees, and a coaching engagement.
// Prints session tokens for an operator and a member.
//
// Guarded to an isolated local database. Never run against production.
import { createHash, randomBytes } from "node:crypto";

async function main() {
  const url = process.env.DATABASE_URL || "";
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
    throw new Error("Refusing to seed: DATABASE_URL is not a local database.");
  }

  const { prisma } = await import("../src/lib/prisma");
  const hash = (t: string) => createHash("sha256").update(t).digest("hex");
  const day = 24 * 60 * 60 * 1000;

  async function session(personId: string) {
    const token = randomBytes(32).toString("hex");
    await prisma.session.create({
      data: {
        tokenHash: hash(token),
        personId,
        expiresAt: new Date(Date.now() + 7 * day),
      },
    });
    return token;
  }

  async function upsertPerson(email: string, data: Record<string, unknown>) {
    return prisma.person.upsert({
      where: { email },
      update: data,
      create: { email, ...data } as never,
    });
  }

  const jess = await upsertPerson("jesswolflord@gmail.com", {
    name: "Jessica Wolf",
    city: "NYC",
    isOperator: true,
    isSuperAdmin: true,
    status: "active",
    agreedTosAt: new Date(),
  });

  const operator = await upsertPerson("qa-operator@example.test", {
    name: "Dana Reyes",
    city: "SF",
    isOperator: true,
    isSuperAdmin: false,
    status: "active",
    agreedTosAt: new Date(),
  });

  const maya = await upsertPerson("maya@example.test", {
    name: "Maya Rosen",
    city: "NYC",
    status: "active",
    appliedAt: new Date(Date.now() - 30 * day),
    agreedTosAt: new Date(),
    phone: "+12125550147",
    bio: "Runs a small design studio in Brooklyn. Marathoner, cooks most nights, keeps a list of restaurants she has not tried yet.",
    lookingFor: "Someone curious and kind who wants something real, not a pen pal.",
    instagram: "https://instagram.com/mayarosen",
    openToMatch: true,
  });

  const alex = await upsertPerson("alex@example.test", {
    name: "Alex Chen",
    city: "NYC",
    status: "active",
    appliedAt: new Date(Date.now() - 26 * day),
    agreedTosAt: new Date(),
    phone: "+12125550188",
    bio: "Founder in fintech, second company. Trail runner, big reader, plays piano badly and often.",
    lookingFor: "A thoughtful partner to build a life with. Direct communication matters to me.",
    openToMatch: true,
  });

  const priya = await upsertPerson("priya@example.test", {
    name: "Priya Nair",
    city: "SF",
    status: "active",
    appliedAt: new Date(Date.now() - 12 * day),
    agreedTosAt: new Date(),
    bio: "Emergency medicine physician. Ceramics on her days off, terrible at sitting still.",
    lookingFor: "Someone steady with their own life going on.",
    openToMatch: true,
  });

  const sam = await upsertPerson("sam@example.test", {
    name: "Sam Okafor",
    city: "SF",
    status: "active",
    appliedAt: new Date(Date.now() - 9 * day),
    agreedTosAt: new Date(),
    bio: "Documentary editor. Cyclist, cinephile, makes a genuinely good negroni.",
    lookingFor: "Warmth and a sense of humor. Someone who travels well.",
    openToMatch: true,
  });

  const applicant = await upsertPerson("rowan@example.test", {
    name: "Rowan Iyer",
    city: "NYC",
    status: "applied",
    appliedAt: new Date(Date.now() - 2 * day),
    agreedTosAt: new Date(),
    bio: "Architect. Recently moved back to New York after six years in Copenhagen.",
    lookingFor: "Someone who reads and argues well.",
  });

  const secondApplicant = await upsertPerson("noor@example.test", {
    name: "Noor Haddad",
    city: "SF",
    status: "applied",
    appliedAt: new Date(Date.now() - 1 * day),
    agreedTosAt: new Date(),
    bio: "Climate policy researcher, recently back from two years in Nairobi.",
    lookingFor: "Someone with a project of their own.",
  });

  // One live introduction so the studio and member surfaces show a real match.
  const existingMatch = await prisma.match.findFirst({
    where: { personAId: maya.id, personBId: alex.id },
  });
  if (!existingMatch) {
    await prisma.match.create({
      data: {
        personAId: maya.id,
        personBId: alex.id,
        createdById: jess.id,
        stage: "suggested",
        rationale: "Both build things for a living and both want the same pace of life.",
        aboutPersonA: "Runs a design studio in Brooklyn\nMarathoner\nCooks most nights",
        aboutPersonB: "Second-time fintech founder\nTrail runner\nBig reader",
      },
    });
  }

  // Dinners: one open with room, one nearly full, so capacity states render.
  const dinnerCount = await prisma.dinner.count();
  if (dinnerCount === 0) {
    const nyc = await prisma.dinner.create({
      data: {
        city: "NYC",
        date: new Date(Date.now() + 14 * day),
        venue: "A private room in the West Village",
        capacity: 8,
        theme: "Founders and makers",
        status: "open",
        notes: "Seated dinner, one long table, no phones out.",
      },
    });
    const sf = await prisma.dinner.create({
      data: {
        city: "SF",
        date: new Date(Date.now() + 21 * day),
        venue: "A chef's counter in Hayes Valley",
        capacity: 6,
        theme: "Doctors, builders, and one very good bartender",
        status: "open",
      },
    });
    await prisma.dinnerAttendee.createMany({
      data: [
        { dinnerId: nyc.id, personId: maya.id, status: "confirmed" },
        { dinnerId: nyc.id, personId: alex.id, status: "confirmed" },
        { dinnerId: sf.id, personId: priya.id, status: "confirmed" },
        { dinnerId: sf.id, personId: sam.id, status: "invited" },
      ],
      skipDuplicates: true,
    });
  }

  const coachingCount = await prisma.coachingEngagement.count();
  if (coachingCount === 0) {
    await prisma.coachingEngagement.create({
      data: {
        clientId: priya.id,
        coachId: jess.id,
        type: "dating",
        status: "active",
        sessions: 3,
        notes: "Working on pacing early conversations.",
      },
    });
  }

  const operatorToken = await session(jess.id);
  const plainOperatorToken = await session(operator.id);
  const memberToken = await session(maya.id);

  console.log(
    JSON.stringify(
      {
        superAdminToken: operatorToken,
        operatorToken: plainOperatorToken,
        memberToken,
        people: {
          superAdmin: jess.name,
          operator: operator.name,
          member: maya.name,
          applicants: [applicant.name, secondApplicant.name],
        },
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
