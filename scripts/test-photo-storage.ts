import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

async function main() {
  if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;
  Reflect.set(process.env, "NODE_ENV", "production");
  process.env.BLOB_READ_WRITE_TOKEN = "";
  const [{ prisma }, { readUpload, writeUpload }] = await Promise.all([
    import("../src/lib/prisma"),
    import("../src/lib/uploads"),
  ]);

  const runId = randomUUID();
  const person = await prisma.person.create({
    data: {
      name: "Photo Storage QA",
      email: `photo-storage-${runId}@example.invalid`,
      city: "NYC",
      status: "active",
    },
  });
  const photoId = randomBytes(16).toString("hex");
  const expected = Buffer.from(`shared-photo-${runId}`);

  try {
    const storage = await writeUpload(photoId, "webp", expected);
    assert.equal(storage.storageUrl, null);
    assert.deepEqual(storage.databaseBytes, expected);

    await prisma.photo.create({
      data: {
        id: photoId,
        personId: person.id,
        url: `/api/photos/${photoId}.webp`,
        status: "pending",
        asset: {
          create: { bytes: Uint8Array.from(storage.databaseBytes!) },
        },
      },
    });
    const photo = await prisma.photo.findUniqueOrThrow({
      where: { id: photoId },
      include: { asset: { select: { bytes: true } } },
    });
    const actual = await readUpload(photoId, "webp", photo.storageUrl, photo.asset?.bytes);
    assert.deepEqual(actual, expected);
  } finally {
    await prisma.person.delete({ where: { id: person.id } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log("shared photo storage checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
