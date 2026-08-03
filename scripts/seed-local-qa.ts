import { createHash, randomBytes, randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";

// Local-only QA helper: seed two matchable members and mint an operator session
// so the studio can be visually reviewed. Guarded to an isolated local database.
const url = process.env.DATABASE_URL || "";
if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
  throw new Error("Refusing to seed: DATABASE_URL is not a local database.");
}

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const a = await prisma.person.create({
    data: {
      name: `Maya Rosen ${suffix}`,
      email: `maya-${suffix}@example.test`,
      city: "NYC",
      status: "active",
      appliedAt: new Date(),
      agreedTosAt: new Date(),
      bio: "Runs a design studio in Brooklyn. Marathoner, loves cooking.",
      lookingFor: "Someone curious and kind who wants something real.",
      instagram: "https://instagram.com/maya",
    },
  });
  const b = await prisma.person.create({
    data: {
      name: `Alex Chen ${suffix}`,
      email: `alex-${suffix}@example.test`,
      city: "NYC",
      status: "active",
      appliedAt: new Date(),
      agreedTosAt: new Date(),
      bio: "Founder in fintech. Trail runner, big reader.",
      lookingFor: "A thoughtful partner to build a life with.",
    },
  });

  const jess = await prisma.person.findUniqueOrThrow({
    where: { email: "jesswolflord@gmail.com" },
  });
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      tokenHash: createHash("sha256").update(token).digest("hex"),
      personId: jess.id,
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    },
  });

  console.log(JSON.stringify({ sessionToken: token, seeded: [a.name, b.name] }));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
