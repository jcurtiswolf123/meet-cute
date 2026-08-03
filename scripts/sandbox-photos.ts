// Give the sandbox real photo bytes.
//
// scripts/seed.ts creates Photo rows with no storageUrl and no PhotoAsset, so
// every image route 404s and the two surfaces where photos matter most (the
// invite page and the invite email) cannot be looked at locally at all. That is
// exactly what you want a sandbox for.
//
// These are generated placeholders, not real people: a flat brand-tinted card
// with the member's initials, one deterministic hue per person so a member's
// photos are recognisably theirs across the roster. Written into PhotoAsset,
// which is the same database-backed path production falls back to when Vercel
// Blob is not configured, so the routes exercise real code.
import sharp from "sharp";
import { prisma } from "../src/lib/prisma";
import { STORED_EXT } from "../src/lib/uploads";

const SIZE = 900;

// Warm, low-saturation hues only. A neon placeholder in a cream editorial
// layout reads as a rendering bug rather than as a stand-in.
function hueFor(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 360;
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "M"
  );
}

function card(name: string, index: number): Buffer {
  const hue = (hueFor(name) + index * 24) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
    <rect width="${SIZE}" height="${SIZE}" fill="hsl(${hue} 32% 82%)"/>
    <circle cx="${SIZE / 2}" cy="${SIZE * 0.42}" r="${SIZE * 0.22}" fill="hsl(${hue} 30% 72%)"/>
    <text x="50%" y="46%" text-anchor="middle" dominant-baseline="middle"
      font-family="Georgia, serif" font-size="${SIZE * 0.2}" fill="hsl(${hue} 40% 28%)">${initials(name)}</text>
    <text x="50%" y="78%" text-anchor="middle"
      font-family="Helvetica, Arial, sans-serif" font-size="${SIZE * 0.045}"
      letter-spacing="6" fill="hsl(${hue} 25% 38%)">SANDBOX PHOTO ${index + 1}</text>
  </svg>`;
  return Buffer.from(svg);
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(`Refusing to run: DATABASE_URL is not local (${url.slice(0, 40)}...)`);
  }

  const photos = await prisma.photo.findMany({
    include: { person: { select: { name: true } }, asset: { select: { photoId: true } } },
    orderBy: [{ personId: "asc" }, { order: "asc" }],
  });

  let filled = 0;
  const seenPerPerson = new Map<string, number>();
  for (const photo of photos) {
    if (photo.asset) continue;
    const index = seenPerPerson.get(photo.personId) ?? 0;
    seenPerPerson.set(photo.personId, index + 1);

    const bytes = await sharp(card(photo.person.name, index))
      .resize(SIZE, SIZE, { fit: "cover" })
      .toFormat(STORED_EXT === "webp" ? "webp" : "jpeg", { quality: 82 })
      .toBuffer();

    await prisma.photoAsset.create({ data: { photoId: photo.id, bytes } });
    filled += 1;
  }

  console.log(`sandbox photos: filled ${filled} of ${photos.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
