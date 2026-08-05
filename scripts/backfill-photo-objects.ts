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

  // Sizes first, never the bytes. Asking Postgres for every photo at once is
  // 24 MB in one result set over a pooled connection, which is how the first
  // version of this managed to hang on a dry run that writes nothing.
  const rows = await prisma.$queryRaw<{ id: string; bytes: number | null }[]>`
    select p.id, octet_length(a.bytes) as bytes
    from meetcute."Photo" p
    left join meetcute."PhotoAsset" a on a."photoId" = p.id
    where p."storageUrl" is null
    order by p.id
  `;

  const withBytes = rows.filter((r) => r.bytes && r.bytes > 0);
  const without = rows.length - withBytes.length;
  const totalMb = withBytes.reduce((n, r) => n + (r.bytes ?? 0), 0) / 1e6;
  console.log(`\n${rows.length} photo(s) with no second copy, ${withBytes.length} of them have bytes to copy (${totalMb.toFixed(1)} MB)`);
  if (without > 0) {
    console.log(`WARNING: ${without} row(s) have neither bytes nor an object. Those are already lost and this cannot recover them.`);
  }
  if (withBytes.length === 0) {
    console.log("nothing to do");
    return;
  }
  if (!send) {
    console.log(`would copy ${withBytes.length} photo(s), ${totalMb.toFixed(1)} MB`);
    console.log("nothing was written. re-run with --send");
    return;
  }

  let done = 0;
  const failed: { id: string; error: string }[] = [];
  // One photo's bytes in memory at a time. 636 KB is the largest here, but the
  // cap is 5 MB and the count only goes up.
  for (const row of withBytes) {
    try {
      const asset = await prisma.photoAsset.findUnique({
        where: { photoId: row.id },
        select: { bytes: true },
      });
      if (!asset?.bytes) throw new Error("bytes vanished between the count and the copy");
      const key = await putObject(row.id, STORED_EXT, Buffer.from(asset.bytes));
      // Recorded only after the put succeeds, so a row never claims a copy that
      // is not there. That claim is what readUpload trusts.
      await prisma.photo.update({ where: { id: row.id }, data: { storageUrl: key } });
      done += 1;
      if (done % 10 === 0) console.log(`  ${done}/${withBytes.length}`);
    } catch (error) {
      failed.push({ id: row.id, error: (error as Error).message });
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
