// Operator-side member import: one JSON file in, one Person plus photos out.
//
// The studio's quickAddPerson takes a name, a channel and a blurb, which is the
// right surface for "somebody at a party asked to be matched". It cannot carry a
// photo, an age, a gender, or the three long fields the profile is actually read
// from, so a member added that way arrives as initials and one sentence, and the
// introduction email has nothing to show. This is the other half: the operator
// has the material in hand (a headshot, a bio they wrote or the member sent) and
// wants the record to look like a finished profile from the first minute.
//
// Photos go through the SAME path an upload does (normalizeImage -> writeUpload
// -> Photo + PhotoAsset), so EXIF/GPS is stripped, the bytes are WebP, and the
// second copy lands in the bucket when one is configured. Anything that skips
// normalizeImage would put a member's home coordinates on the platform.
//
// Usage:
//   set -a; . ./.env; set +a        # or .env.sandbox to rehearse
//   npx tsx scripts/add-member.ts path/to/profile.json [--commit] [--update]
//
// Without --commit it prints what it would write and touches nothing. --update
// means "this person is already here": their fields are refreshed from the JSON
// and the listed photos are APPENDED, which is how a second photo found after
// the import gets on the profile without a hand-written one-off script.
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { normalizeImage, writeUpload, uploadStorageMode, STORED_EXT } from "../src/lib/uploads";
import { normalizeLinkedin, normalizeInstagram, normalizePhone } from "../src/lib/sms";
import { CITIES, isCity } from "../src/lib/cities";

type MemberInput = {
  name: string;
  email?: string;
  phone?: string;
  city: string;
  secondCity?: string;
  neighborhood?: string;
  gender?: string;
  seeking?: string;
  birthdate?: string; // YYYY-MM-DD
  headline?: string;
  bio?: string;
  lookingFor?: string;
  dealBreakers?: string;
  linkedin?: string;
  instagram?: string;
  status?: string; // applicant | active | paused | exited
  openToMatch?: boolean;
  photos?: string[]; // local file paths, first is the lead photo
  note?: string; // operator note recorded against the person
};

const MAX_PHOTOS = 6;

function ageFrom(birthdate: Date): number {
  const now = new Date();
  let age = now.getUTCFullYear() - birthdate.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - birthdate.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < birthdate.getUTCDate())) age -= 1;
  return age;
}

async function main() {
  const [file, ...flags] = process.argv.slice(2);
  const commit = flags.includes("--commit");
  const update = flags.includes("--update");
  if (!file) {
    console.error("usage: npx tsx scripts/add-member.ts <profile.json> [--commit]");
    process.exit(2);
  }

  const input = JSON.parse(readFileSync(file, "utf8")) as MemberInput;
  if (!input.name) throw new Error("name is required");
  if (!input.email && !input.phone) throw new Error("an email or a phone is required");
  const city = input.city?.toUpperCase();
  if (!isCity(city)) {
    throw new Error(`city must be one of ${CITIES.map((c) => c.value).join(", ")}`);
  }
  const photoPaths = (input.photos ?? []).slice(0, MAX_PHOTOS);

  const birthdate = input.birthdate ? new Date(`${input.birthdate}T00:00:00.000Z`) : null;
  if (birthdate && Number.isNaN(birthdate.getTime())) throw new Error("birthdate must be YYYY-MM-DD");
  const age = birthdate ? ageFrom(birthdate) : undefined;
  if (age !== undefined && age < 18) throw new Error("under 18");

  const data = {
    name: input.name,
    email: input.email?.trim().toLowerCase() || null,
    phone: normalizePhone(input.phone),
    city,
    secondCity: input.secondCity?.toUpperCase() || null,
    neighborhood: input.neighborhood || null,
    gender: input.gender || null,
    seeking: input.seeking || null,
    birthdate,
    age,
    headline: input.headline || null,
    bio: input.bio || null,
    lookingFor: input.lookingFor || null,
    dealBreakers: input.dealBreakers || null,
    linkedin: normalizeLinkedin(input.linkedin),
    instagram: normalizeInstagram(input.instagram),
    status: input.status || "applicant",
    openToMatch: input.openToMatch ?? false,
  };

  const host = (process.env.DATABASE_URL || "").split("@")[1]?.split("/")[0] ?? "(unset)";
  console.log(`database: ${host}`);
  console.log(`photo storage: ${uploadStorageMode()}`);
  console.log(`person: ${JSON.stringify({ ...data, bio: data.bio && `${data.bio.slice(0, 60)}...` }, null, 2)}`);
  console.log(`photos: ${photoPaths.length} (${photoPaths.join(", ") || "none"})`);
  if (!commit) {
    console.log("\ndry run. Pass --commit to write.");
    return;
  }

  const prisma = new PrismaClient();
  try {
    const existing = data.email
      ? await prisma.person.findUnique({ where: { email: data.email } })
      : null;
    if (existing && !update) {
      throw new Error(`${data.email} already exists as ${existing.id} (${existing.name}). Re-run with --update to refresh them and append the photos.`);
    }

    const person = existing
      ? await prisma.person.update({ where: { id: existing.id }, data })
      : await prisma.person.create({ data });
    console.log(`${existing ? "updated" : "created"} ${person.id}`);

    let order = await prisma.photo.count({ where: { personId: person.id } });
    if (order + photoPaths.length > MAX_PHOTOS) {
      throw new Error(`${order} photo(s) already on file; ${photoPaths.length} more would pass the ${MAX_PHOTOS} cap.`);
    }
    for (const path of photoPaths) {
      const raw = readFileSync(path);
      const bytes = await normalizeImage(raw);
      const id = randomBytes(16).toString("hex");
      const storage = await writeUpload(id, STORED_EXT, bytes);
      await prisma.photo.create({
        data: {
          id,
          personId: person.id,
          url: `/api/photos/${id}.${STORED_EXT}`,
          storageUrl: storage.storageUrl,
          order: order++,
          status: "approved",
          ...(storage.databaseBytes
            ? { asset: { create: { bytes: Uint8Array.from(storage.databaseBytes) } } }
            : {}),
        },
      });
      console.log(`  photo ${order}: ${path} -> ${id} (${bytes.length} bytes webp)`);
    }

    if (input.note) {
      const author = await prisma.person.findFirst({ where: { isOperator: true }, orderBy: { createdAt: "asc" } });
      if (author) {
        await prisma.note.create({
          data: { authorId: author.id, subjectId: person.id, body: input.note },
        });
        console.log("  note recorded");
      }
    }

    const check = await prisma.person.findUnique({
      where: { id: person.id },
      include: { photos: true },
    });
    console.log(`\nverified: ${check?.name}, ${check?.city}, age ${check?.age}, status ${check?.status}, ${check?.photos.length} photo(s)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
