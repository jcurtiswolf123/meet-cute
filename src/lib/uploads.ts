// Photo upload storage.
//
// Two shared backends, chosen at runtime so the same call sites work everywhere:
//   - Vercel Blob: set BLOB_READ_WRITE_TOKEN. Objects live in a
//     global store, so any number of app instances can read every photo. This
//     is what makes the deployment horizontally scalable.
//   - Postgres: the fallback when Blob is not configured. Normalized bytes live
//     in PhotoAsset, shared by every app instance and local process.
//
// Either way photos are still served through the auth-gated /api/photos route,
// never linked to directly, so pending (unmoderated) images stay private until
// an operator approves them.
import sharp from "sharp";
import { put, del } from "@vercel/blob";

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

export type UploadStorageMode = "blob" | "database";

export function uploadStorageMode(args: {
  production?: boolean;
  blobToken?: string | null;
} = {}): UploadStorageMode {
  const blobToken = args.blobToken ?? process.env.BLOB_READ_WRITE_TOKEN;
  if (blobToken) return "blob";
  return "database";
}

function blobEnabled(): boolean {
  return uploadStorageMode() === "blob";
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

/** Persist already-normalized bytes or return them for an atomic database write. */
export async function writeUpload(
  id: string,
  ext: string,
  bytes: Buffer,
): Promise<UploadWriteResult> {
  const mode = uploadStorageMode();
  if (mode === "blob") {
    // addRandomSuffix:true so the public object URL is an unguessable capability
    // (not photos/{cuid}.webp): the app always serves photos through the
    // auth-gated /api/photos route, and a random suffix stops anyone from
    // deriving a pending/unmoderated image's raw blob URL from the person id.
    const { url } = await put(`photos/${id}.${ext}`, bytes, {
      access: "public",
      addRandomSuffix: true,
      contentType: contentTypeForExt(ext),
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return { storageUrl: url, databaseBytes: null };
  }
  return { storageUrl: null, databaseBytes: bytes };
}

/** Read bytes for serving. Prefers the external store (storageUrl) and falls
 *  back to the shared database asset. */
export async function readUpload(
  _id: string,
  _ext: string,
  storageUrl?: string | null,
  databaseBytes?: Uint8Array | null,
): Promise<Buffer> {
  void _id;
  void _ext;
  if (storageUrl) {
    const res = await fetch(storageUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`blob fetch ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  if (databaseBytes) return Buffer.from(databaseBytes);
  throw new Error("database photo asset is missing");
}

/** Best-effort delete from the backing store when a member removes a photo. */
export async function deleteUpload(
  storageUrl?: string | null,
  _id?: string,
): Promise<void> {
  void _id;
  if (storageUrl && blobEnabled()) {
    await del(storageUrl, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => {});
  }
}

const TYPE_BY_EXT: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
export function contentTypeForExt(ext: string): string {
  return TYPE_BY_EXT[ext] ?? "application/octet-stream";
}
