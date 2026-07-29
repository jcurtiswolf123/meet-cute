// Walk the whole introduction flow on the live site with real people.
//
// This is for rehearsing the product with an operator (Jess) and two member
// accounts you control, end to end: profile, opt in, operator sends the
// introduction, both sides decide, Meet Cute connects them. It touches only the
// three accounts named below and never invents content over anything a real
// person already wrote.
//
//   npx tsx scripts/rehearsal.ts status
//   npx tsx scripts/rehearsal.ts links
//   npx tsx scripts/rehearsal.ts profiles --yes
//   npx tsx scripts/rehearsal.ts reset --yes
//
// Accounts (override with REHEARSAL_OPERATOR / REHEARSAL_A / REHEARSAL_B):
//   operator  jesswolflord@gmail.com        Jess, super admin, runs the Studio
//   member A  jessicaraquelwolf@gmail.com   Jess's own member account
//   member B  admin@shiftsupportnetwork.com Josh's member account
//
// Runs against whatever DATABASE_URL points at, which in practice is production.
// `status` and `links` only read. `profiles` and `reset` write and require --yes.
import sharp from "sharp";
import { prisma } from "../src/lib/prisma";
import { createLoginToken, normalizeEmail } from "../src/lib/auth";

const OPERATOR = normalizeEmail(process.env.REHEARSAL_OPERATOR || "jesswolflord@gmail.com");
const MEMBER_A = normalizeEmail(process.env.REHEARSAL_A || "jessicaraquelwolf@gmail.com");
const MEMBER_B = normalizeEmail(process.env.REHEARSAL_B || "admin@shiftsupportnetwork.com");
const BASE = (process.env.NEXT_PUBLIC_APP_URL || "https://hellomeetcute.com").replace(/\/$/, "");

const confirmed = process.argv.includes("--yes");

/** Placeholder profile content, used ONLY to fill a field that is empty. A
 *  rehearsal with blank profiles tells you nothing: the invite email and the
 *  decision page both render the other person, so with no headline, bio, or
 *  photo there is nothing on screen to react to. Anything the member has
 *  already written is left exactly as it is. */
const FILLER: Record<string, { headline: string; bio: string; lookingFor: string }> = {
  [MEMBER_A]: {
    headline: "Placeholder headline. Replace this from the member app.",
    bio: "Placeholder bio so the introduction has something to show. Sign in as this member and write the real one.",
    lookingFor: "Placeholder. Replace from the member app.",
  },
  [MEMBER_B]: {
    headline: "Placeholder headline. Replace this from the member app.",
    bio: "Placeholder bio so the introduction has something to show. Sign in as this member and write the real one.",
    lookingFor: "Placeholder. Replace from the member app.",
  },
};

async function personOrThrow(email: string) {
  const person = await prisma.person.findUnique({
    where: { email },
    include: { photos: { select: { id: true } }, prompts: { select: { id: true } } },
  });
  if (!person) throw new Error(`No account for ${email}. Create it first, or set REHEARSAL_A / REHEARSAL_B.`);
  return person;
}

/** A neutral placeholder image: cream field, ink initials. Deliberately not a
 *  stock portrait, so nobody mistakes rehearsal data for a real member. */
async function placeholderPhoto(name: string): Promise<Uint8Array<ArrayBuffer>> {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800">
    <rect width="640" height="800" fill="#faf9f6"/>
    <text x="320" y="430" font-family="Georgia, serif" font-size="180"
          fill="#1a1a1a" text-anchor="middle" opacity="0.82">${initials}</text>
    <text x="320" y="520" font-family="Georgia, serif" font-size="26"
          fill="#1a1a1a" text-anchor="middle" opacity="0.45">rehearsal placeholder</text>
  </svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  // Copy into a plain ArrayBuffer: Prisma's Bytes column will not accept a view
  // that might be backed by a SharedArrayBuffer.
  const bytes = new Uint8Array(new ArrayBuffer(png.byteLength));
  bytes.set(png);
  return bytes;
}

async function status() {
  const [operator, a, b] = await Promise.all([
    personOrThrow(OPERATOR),
    personOrThrow(MEMBER_A),
    personOrThrow(MEMBER_B),
  ]);

  console.log(`operator  ${operator.name} <${operator.email}>  ${operator.isSuperAdmin ? "super admin" : "operator"}`);
  for (const person of [a, b]) {
    const missing = [
      person.headline ? null : "headline",
      person.bio ? null : "bio",
      person.age ? null : "age",
      person.photos.length ? null : "photo",
    ].filter(Boolean);
    console.log(
      `member    ${person.name} <${person.email}>  status=${person.status} ` +
        `openToMatch=${person.openToMatch} photos=${person.photos.length} ` +
        (missing.length ? `MISSING: ${missing.join(", ")}` : "profile complete"),
    );
  }

  const match = await prisma.match.findFirst({
    where: {
      OR: [
        { personAId: a.id, personBId: b.id },
        { personAId: b.id, personBId: a.id },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: { invites: { select: { sentAt: true, decidedAt: true } } },
  });
  if (!match) {
    console.log("\nno introduction between these two yet");
    return;
  }
  console.log(
    `\nintroduction  stage=${match.stage} a=${match.aDecision} b=${match.bDecision} ` +
      `connectedAt=${match.connectedAt ? match.connectedAt.toISOString() : "null"}`,
  );
  for (const invite of match.invites) {
    console.log(`  invite sent=${invite.sentAt ? invite.sentAt.toISOString() : "no"} decided=${invite.decidedAt ? invite.decidedAt.toISOString() : "no"}`);
  }

  const jobs = await prisma.deliveryJob.findMany({
    where: { matchId: match.id },
    select: { kind: true, status: true, recipient: true, providerMessageId: true, lastError: true },
    orderBy: { createdAt: "asc" },
  });
  for (const job of jobs) {
    console.log(`  ${job.kind} ${job.status} -> ${job.recipient}${job.lastError ? ` error=${job.lastError}` : ""}`);
  }
  if (jobs.some((job) => job.providerMessageId)) {
    console.log("\n  provider delivery state (did it actually land):");
    const { fetchEmailProviderStatus } = await import("../src/lib/email");
    for (const job of jobs) {
      if (!job.providerMessageId) continue;
      const result = await fetchEmailProviderStatus(job.providerMessageId);
      console.log(`  ${job.kind}: ${result.ok ? result.lastEvent : `lookup failed, ${result.error}`}`);
    }
  }
}

async function links() {
  console.log("Single-use, valid 15 minutes. Open each in a separate browser or profile.\n");
  for (const email of [OPERATOR, MEMBER_A, MEMBER_B]) {
    const person = await personOrThrow(email);
    const token = await createLoginToken(email);
    const destination = person.isOperator
      ? "/studio"
      : person.status === "applicant"
        ? "/apply"
        : "/app";
    console.log(`${person.name} <${email}>  ->  ${destination}`);
    console.log(`${BASE}/auth/verify?token=${encodeURIComponent(token)}\n`);
  }
}

async function profiles() {
  if (!confirmed) {
    console.log(`Would fill ONLY empty profile fields on ${MEMBER_A} and ${MEMBER_B}.`);
    console.log("Existing headlines, bios, ages, and photos are never overwritten.");
    console.log("Re-run with --yes to apply.");
    return;
  }
  for (const email of [MEMBER_A, MEMBER_B]) {
    const person = await personOrThrow(email);
    const filler = FILLER[email];
    const data: Record<string, unknown> = {};
    if (!person.headline && filler) data.headline = filler.headline;
    if (!person.bio && filler) data.bio = filler.bio;
    if (!person.lookingFor && filler) data.lookingFor = filler.lookingFor;
    if (person.status !== "active") data.status = "active";
    if (!person.openToMatch) {
      data.openToMatch = true;
      data.optedInAt = new Date();
    }
    if (!person.agreedTosAt) data.agreedTosAt = new Date();

    if (Object.keys(data).length) {
      await prisma.person.update({ where: { id: person.id }, data });
      console.log(`${person.name}: set ${Object.keys(data).join(", ")}`);
    } else {
      console.log(`${person.name}: nothing to fill`);
    }

    if (!person.photos.length) {
      const photo = await prisma.photo.create({
        data: { personId: person.id, url: "", order: 0, status: "approved" },
      });
      await prisma.photo.update({
        where: { id: photo.id },
        data: { url: `/api/photos/${photo.id}.png` },
      });
      await prisma.photoAsset.create({
        data: { photoId: photo.id, bytes: await placeholderPhoto(person.name) },
      });
      console.log(`${person.name}: added a placeholder photo`);
    }
  }
  console.log("\nReplace the placeholders by signing in as each member and editing the profile.");
}

async function reset() {
  const [a, b] = await Promise.all([personOrThrow(MEMBER_A), personOrThrow(MEMBER_B)]);
  const matches = await prisma.match.findMany({
    where: {
      OR: [
        { personAId: a.id, personBId: b.id },
        { personAId: b.id, personBId: a.id },
      ],
    },
    select: { id: true, stage: true },
  });
  if (!matches.length) {
    console.log("no introduction between these two, nothing to reset");
    return;
  }
  if (!confirmed) {
    console.log(`Would delete ${matches.length} introduction(s) between ${a.name} and ${b.name}:`);
    for (const match of matches) console.log(`  ${match.id} stage=${match.stage}`);
    console.log("Their profiles and accounts are untouched. Re-run with --yes to apply.");
    return;
  }
  const ids = matches.map((match) => match.id);
  await prisma.matchInvite.deleteMany({ where: { matchId: { in: ids } } });
  await prisma.deliveryJob.deleteMany({ where: { matchId: { in: ids } } });
  await prisma.introMessage.deleteMany({ where: { matchId: { in: ids } } });
  await prisma.conciergeThread.deleteMany({ where: { matchId: { in: ids } } });
  await prisma.match.deleteMany({ where: { id: { in: ids } } });
  console.log(`removed ${ids.length} introduction(s). Both accounts and profiles are untouched.`);
}

const commands: Record<string, () => Promise<void>> = { status, links, profiles, reset };
const command = process.argv[2] || "status";
const run = commands[command];

(async () => {
  try {
    if (!run) throw new Error(`unknown command "${command}" (status | links | profiles | reset)`);
    await run();
  } catch (error) {
    console.error("Error:", (error as Error).message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
