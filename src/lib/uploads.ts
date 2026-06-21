// Photo upload storage.
//
// Two backends, chosen at runtime so the same call sites work everywhere:
//   - Vercel Blob (production): set BLOB_READ_WRITE_TOKEN. Objects live in a
//     global store, so any number of app instances can read every photo. This
//     is what makes the deployment horizontally scalable.
//   - Local disk (dev / single box): no token -> files are written under
//     UPLOAD_DIR and read back from there.
//
// Either way photos are still served through the auth-gated /api/photos route,
// never linked to directly, so pending (unmoderated) images stay private until
// an operator approves them.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import sharp from "sharp";
import { put, del } from "@vercel/blob";

export const UPLOAD_DIR =
  process.env.UPLOAD_DIR || (process.env.NODE_ENV === "production" ? "/data/uploads" : "./.uploads");

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

function blobEnabled(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/**
 * Re-encode an uploaded image to a clean, bounded WebP.
 *
 * Why this exists: phone photos carry EXIF metadata, and EXIF routinely
 * includes GPS coordinates. Serving the original bytes would leak a member's
 * home/where-the-photo-was-taken to anyone who can view the photo — a real
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

/** Persist already-normalized bytes. Returns the external storage URL when the
 *  object lives in Blob, or null when it lives on local disk. */
export async function writeUpload(id: string, ext: string, bytes: Buffer): Promise<string | null> {
  if (blobEnabled()) {
    const { url } = await put(`photos/${id}.${ext}`, bytes, {
      access: "public",
      addRandomSuffix: false,
      contentType: contentTypeForExt(ext),
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return url;
  }
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(join(UPLOAD_DIR, `${id}.${ext}`), bytes);
  return null;
}

/** Read bytes for serving. Prefers the external store (storageUrl) and falls
 *  back to local disk. The local path is asserted to stay inside UPLOAD_DIR so
 *  a crafted id/ext can never escape the directory. */
export async function readUpload(id: string, ext: string, storageUrl?: string | null): Promise<Buffer> {
  if (storageUrl) {
    const res = await fetch(storageUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`blob fetch ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const base = resolve(UPLOAD_DIR);
  const full = resolve(base, `${id}.${ext}`);
  if (full !== base && !full.startsWith(base + sep)) {
    throw new Error("invalid path");
  }
  return readFile(full);
}

/** Best-effort delete from the backing store (called when a member removes a
 *  photo). Local-disk files are left for the OS/volume lifecycle; Blob objects
 *  are billed, so we delete them. */
export async function deleteUpload(storageUrl?: string | null): Promise<void> {
  if (storageUrl && blobEnabled()) {
    await del(storageUrl, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => {});
  }
}

const TYPE_BY_EXT: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
export function contentTypeForExt(ext: string): string {
  return TYPE_BY_EXT[ext] ?? "application/octet-stream";
}
