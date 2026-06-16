import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionPersonId } from "@/lib/auth";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { extFor, writeUpload, MAX_BYTES } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Upload a profile photo. Auth required. Allowlisted image types only, size
// capped, stored to the volume, and created in `pending` so it is invisible to
// other members until an operator approves it.
export async function POST(req: Request) {
  const me = await getSessionPersonId();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = rateLimit(`photo:${clientKey(req)}:${me}`, 10, 60 * 60 * 1000);
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

  const buf = Buffer.from(await file.arrayBuffer());
  const count = await prisma.photo.count({ where: { personId: me } });
  const photo = await prisma.photo.create({
    data: { personId: me, url: "", order: count, status: "pending" },
  });
  await writeUpload(photo.id, ext, buf);
  const url = `/api/photos/${photo.id}.${ext}`;
  await prisma.photo.update({ where: { id: photo.id }, data: { url } });

  return NextResponse.json({ ok: true, id: photo.id, url, status: "pending" });
}
