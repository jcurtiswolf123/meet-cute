// Give every photo already in Postgres its second copy.
//
// Uploads write both from now on. These 125 were written before that was true,
// so until this runs they are still one copy in one place, which is the whole
// thing being fixed.
//
// Reads the bytes out of PhotoAsset and puts them in the bucket through exactly
// the same call a live upload makes, then records the key on the row so the
// bucket is reachable as the backstop. Never deletes, never rewrites bytes, and
// re-running is free: anything already carrying a key is skipped.
//
//   node --env-file-if-exists=.env --import tsx scripts/backfill-photo-objects.ts          # dry run
//   node --env-file-if-exists=.env --import tsx scripts/backfill-photo-objects.ts --send

import { prisma } from "../src/lib/prisma";
import { putObject, objectStoreConfigured, STORED_EXT } from "../src/lib/uploads";

const send = process.argv.includes("--send");

async function main() {
  console.log(`target:  ${new URL(process.env.DATABASE_URL!).hostname}`);
  console.log(`bucket:  ${process.env.BUCKET_NAME ?? "(none)"} at ${process.env.AWS_ENDPOINT_URL_S3 ?? "(none)"}`);
  console.log(send ? "MODE:    writing" : "MODE:    dry run (pass --send)");

  if (!objectStoreConfigured()) {
    throw new Error(
      "No bucket configured. This needs AWS_ENDPOINT_URL_S3, BUCKET_NAME, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, which `fly storage create` sets on the app.",
    );
  }

  // Only rows that have bytes and no key yet. A row with a key already has its
  // second copy; a row with no bytes has nothing to copy and is a separate
  // problem this script must not paper over.
  const photos = await prisma.photo.findMany({
    where: { storageUrl: null },
    select: { id: true, personId: true, asset: { select: { bytes: true } } },
    orderBy: { id: "asc" },
  });

  const withBytes = photos.filter((p) => p.asset?.bytes);
  const without = photos.length - withBytes.length;
  console.log(`\n${photos.length} photo(s) with no second copy, ${withBytes.length} of them have bytes to copy`);
  if (without > 0) {
    console.log(`WARNING: ${without} row(s) have neither bytes nor an object. Those are already lost and this cannot recover them.`);
  }
  if (withBytes.length === 0) {
    console.log("nothing to do");
    return;
  }
  if (!send) {
    console.log(`would copy ${withBytes.length} photo(s), ${(withBytes.reduce((n, p) => n + (p.asset?.bytes?.length ?? 0), 0) / 1e6).toFixed(1)} MB`);
    console.log("nothing was written. re-run with --send");
    return;
  }

  let done = 0;
  const failed: { id: string; error: string }[] = [];
  for (const photo of withBytes) {
    try {
      const key = await putObject(photo.id, STORED_EXT, Buffer.from(photo.asset!.bytes));
      // Recorded only after the put succeeds, so a row never claims a copy that
      // is not there. That claim is what readUpload trusts.
      await prisma.photo.update({ where: { id: photo.id }, data: { storageUrl: key } });
      done += 1;
      if (done % 25 === 0) console.log(`  ${done}/${withBytes.length}`);
    } catch (error) {
      failed.push({ id: photo.id, error: (error as Error).message });
    }
  }

  console.log(`\ncopied ${done} of ${withBytes.length}`);
  if (failed.length) {
    console.log(`failed ${failed.length}:`);
    for (const f of failed.slice(0, 10)) console.log(`  ${f.id}  ${f.error}`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
