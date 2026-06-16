// Photo upload storage. Files are written to a writable directory (the Fly
// volume in production, a local folder in dev) and served back through a route
// handler, never from /public, so we can gate pending photos behind moderation.
//
// For a multi-instance deployment, swap writeUpload/readUpload for signed S3 /
// Vercel Blob uploads; the call sites stay the same.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

export const UPLOAD_DIR =
  process.env.UPLOAD_DIR || (process.env.NODE_ENV === "production" ? "/data/uploads" : "./.uploads");

// Allowlisted image types only. Map to the extension we persist.
export const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export function extFor(contentType: string): string | null {
  return ALLOWED[contentType] ?? null;
}

export async function writeUpload(id: string, ext: string, bytes: Buffer): Promise<void> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(join(UPLOAD_DIR, `${id}.${ext}`), bytes);
}

export async function readUpload(id: string, ext: string): Promise<Buffer> {
  // Assert the resolved path stays inside UPLOAD_DIR, so a crafted id/ext can
  // never escape the directory even if upstream validation is bypassed.
  const base = resolve(UPLOAD_DIR);
  const full = resolve(base, `${id}.${ext}`);
  if (full !== base && !full.startsWith(base + sep)) {
    throw new Error("invalid path");
  }
  return readFile(full);
}

const TYPE_BY_EXT: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
export function contentTypeForExt(ext: string): string {
  return TYPE_BY_EXT[ext] ?? "application/octet-stream";
}
