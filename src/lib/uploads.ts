// Photo upload storage.
//
// Every photo is written twice, and that is the whole point of this file.
//
// Until 4 August it was written once. `writeUpload` chose a backend and
// returned the bytes for exactly one of them, so the database branch meant
// Postgres held the only copy of every member photo on the platform, and the
// object-store branch would have meant the object store held the only copy. The
// schema calls PhotoAsset a "fallback", which it could never be while nothing
// else had the bytes. 125 photos, 24 MB, one copy, and a product about to start
// asking for a lot more of them.
//
// So now:
//   Postgres   serves. Same region as the app, shared by every instance,
//              already proven, and an ordinary photo view never leaves the
//              datacentre.
//   Tigris     is the second copy. Written on every upload, best effort: a
//              bucket having a bad day must never be why an applicant cannot
//              finish. Provisioned with `fly storage create`, private, with
//              credentials arriving as the standard AWS_* secrets.
//
// Vercel Blob used to be the other branch and is gone. The account it needs is
// past its usage threshold and its one existing store is suspended, so it could
// not have held a copy of anything. It also dragged in a vulnerable undici.
//
// Photos are served through the auth-gated /api/photos route, never linked to
// directly, and the bucket is private, so nothing is readable without a session.
import sharp from "sharp";
import * as Sentry from "@sentry/nextjs";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

// Allowlisted *input* image types only. Output is always normalized to WebP.
export const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
// Stored images are always re-encoded to WebP, so the persisted extension is
// fixed. This also strips any original metadata (see normalizeImage).
export const STORED_EXT = "webp";

export function extFor(contentType: string): string | null {
  return ALLOWED[contentType] ?? null;
}

export type UploadStorageMode = "mirrored" | "database";

/**
 * "mirrored" means both copies, which is what production should always be.
 * "database" is the honest answer when no bucket is configured: local
 * development, CI, and anything else without credentials. That is a working
 * single copy, not a broken double one.
 */
export function uploadStorageMode(): UploadStorageMode {
  return objectStoreConfigured() ? "mirrored" : "database";
}

export function objectStoreConfigured(): boolean {
  return !!(
    process.env.AWS_ENDPOINT_URL_S3 &&
    process.env.BUCKET_NAME &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  );
}

let client: S3Client | null = null;
function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: process.env.AWS_REGION || "auto",
      endpoint: process.env.AWS_ENDPOINT_URL_S3,
      // Tigris is S3-compatible but wants path-style addressing.
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
      },
    });
  }
  return client;
}

/** The object key for a photo. It is stored on Photo.storageUrl, which predates
 *  this and held a Vercel Blob URL. A key is distinguishable from one by not
 *  being an absolute URL, which is how readUpload tells them apart. */
export function objectKeyFor(id: string, ext: string): string {
  return `photos/${id}.${ext}`;
}

/**
 * Re-encode an uploaded image to a clean, bounded WebP.
 *
 * Why this exists: phone photos carry EXIF metadata, and EXIF routinely
 * includes GPS coordinates. Serving the original bytes would leak a member's
 * home/where-the-photo-was-taken to anyone who can view the photo, a real
 * safety problem for a dating product. sharp drops all metadata by default;
 * .rotate() first bakes the EXIF orientation into the pixels so the image is
 * not sideways once the orientation tag is gone. We also cap dimensions to
 * defang decompression-bomb style inputs and keep files small.
 */
export async function normalizeImage(input: Buffer): Promise<Buffer> {
  return sharp(input, { failOn: "error", limitInputPixels: 50_000_000 })
    .rotate() // apply EXIF orientation, then metadata is dropped on output
    .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
}

export type UploadWriteResult = {
  storageUrl: string | null;
  databaseBytes: Buffer | null;
};

/** Put an object in the bucket. Exported so the backfill takes exactly the path
 *  a live upload takes, rather than a second implementation of it. */
export async function putObject(id: string, ext: string, bytes: Buffer): Promise<string> {
  const key = objectKeyFor(id, ext);
  await s3().send(
    new PutObjectCommand({
      Bucket: process.env.BUCKET_NAME as string,
      Key: key,
      Body: bytes,
      ContentType: contentTypeForExt(ext),
    }),
  );
  return key;
}

/**
 * Persist the bytes.
 *
 * Always returns databaseBytes, so the caller writes the copy that serves. The
 * bucket copy is attempted alongside and is allowed to fail: losing a backup is
 * bad and worth an alert, losing the applicant is worse. Anything that only
 * reached Postgres is picked up by scripts/backfill-photo-objects.ts.
 */
export async function writeUpload(
  id: string,
  ext: string,
  bytes: Buffer,
): Promise<UploadWriteResult> {
  if (!objectStoreConfigured()) return { storageUrl: null, databaseBytes: bytes };

  try {
    const key = await putObject(id, ext, bytes);
    return { storageUrl: key, databaseBytes: bytes };
  } catch (error) {
    // Loud, because the reason this file was rewritten is that nobody noticed
    // there was only ever one copy.
    console.error(`[uploads] second copy failed for ${id}: ${(error as Error).message}`);
    Sentry.captureException(error, { tags: { area: "uploads", photoId: id } });
    return { storageUrl: null, databaseBytes: bytes };
  }
}

async function getObject(key: string): Promise<Buffer> {
  const res = await s3().send(
    new GetObjectCommand({ Bucket: process.env.BUCKET_NAME as string, Key: key }),
  );
  const body = res.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
  if (!body?.transformToByteArray) throw new Error("object body is not readable");
  return Buffer.from(await body.transformToByteArray());
}

/**
 * Read bytes for serving.
 *
 * Database first. It is in the same region as the app and it is the copy every
 * instance already shares, so an ordinary photo view never makes a call out of
 * the datacentre. The bucket is the backstop, which is also what turns a row
 * whose bytes went missing into something recoverable rather than a 404.
 */
export async function readUpload(
  _id: string,
  _ext: string,
  storageUrl?: string | null,
  databaseBytes?: Uint8Array | null,
): Promise<Buffer> {
  void _id;
  void _ext;
  if (databaseBytes) return Buffer.from(databaseBytes);

  if (storageUrl) {
    // An absolute URL is a legacy Vercel Blob row. A key is ours.
    if (/^https?:\/\//i.test(storageUrl)) {
      const res = await fetch(storageUrl, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`blob fetch ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    }
    if (objectStoreConfigured()) return getObject(storageUrl);
  }
  throw new Error("photo bytes are missing from both copies");
}

/** Best-effort delete from the backing store when a member removes a photo. The
 *  database row goes with the Photo by cascade; this clears the object so a
 *  deleted photo does not quietly persist in a bucket. */
export async function deleteUpload(
  storageUrl?: string | null,
  _id?: string,
): Promise<void> {
  void _id;
  if (!storageUrl || /^https?:\/\//i.test(storageUrl) || !objectStoreConfigured()) return;
  await s3()
    .send(new DeleteObjectCommand({ Bucket: process.env.BUCKET_NAME as string, Key: storageUrl }))
    .catch(() => {});
}

const TYPE_BY_EXT: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
export function contentTypeForExt(ext: string): string {
  return TYPE_BY_EXT[ext] ?? "application/octet-stream";
}
