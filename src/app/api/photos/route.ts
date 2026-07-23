import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSessionPersonId } from "@/lib/auth";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { deleteUpload, extFor, writeUpload, normalizeImage, MAX_BYTES, STORED_EXT } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Upload a profile photo. Auth required. Allowlisted image types only, size
// capped, stored to the volume, and created in `pending` so it is invisible to
// other members until an operator approves it.
export async function POST(req: Request) {
  const me = await getSessionPersonId();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = await rateLimit(`photo:${clientKey(req)}:${me}`, 10, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many uploads. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let file: Blob | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof Blob) file = f;
  } catch {
    return NextResponse.json({ error: "Bad upload." }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "No file." }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large. Max 5 MB." }, { status: 413 });
  }
  const ext = extFor(file.type);
  if (!ext) {
    return NextResponse.json({ error: "Only JPEG, PNG, or WebP images." }, { status: 415 });
  }

  // Re-encode to a clean WebP: strips EXIF/GPS metadata, bakes orientation,
  // and bounds dimensions. Reject anything sharp cannot decode as an image
  // (catches mislabeled content-types and corrupt/malicious payloads).
  const raw = Buffer.from(await file.arrayBuffer());
  let buf: Buffer;
  try {
    buf = await normalizeImage(raw);
  } catch {
    return NextResponse.json({ error: "That image could not be processed." }, { status: 422 });
  }

  const count = await prisma.photo.count({ where: { personId: me } });
  const id = randomBytes(16).toString("hex");
  let storageUrl: string | null;
  try {
    storageUrl = await writeUpload(id, STORED_EXT, buf);
  } catch {
    return NextResponse.json({ error: "Upload storage is unavailable." }, { status: 503 });
  }
  const url = `/api/photos/${id}.${STORED_EXT}`;
  try {
    await prisma.photo.create({
      data: { id, personId: me, url, storageUrl, order: count, status: "pending" },
    });
  } catch {
    await deleteUpload(storageUrl, id);
    return NextResponse.json({ error: "The upload could not be saved." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id, url, status: "pending" });
}
