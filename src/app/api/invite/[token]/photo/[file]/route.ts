import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readUpload, contentTypeForExt } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serve a profile photo to a holder of a valid invite token, without a session.
// The token authorizes viewing exactly the OTHER person on that match, and only
// their APPROVED photos, so no unmoderated or unrelated image can leak. Mirrors
// the strict validation of the signed-in /api/photos/[file] route.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string; file: string }> },
) {
  const { token, file } = await params;

  const invite = await prisma.matchInvite.findUnique({ where: { token } });
  if (!invite) return new NextResponse("Not found", { status: 404 });

  const dot = file.lastIndexOf(".");
  if (dot < 0) return new NextResponse("Not found", { status: 404 });
  const id = file.slice(0, dot);
  const ext = file.slice(dot + 1);
  if (!/^[a-z0-9]{20,40}$/i.test(id) || !["jpg", "png", "webp"].includes(ext)) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Resolve which person the token-holder is allowed to see (the OTHER side).
  const match = await prisma.match.findUnique({
    where: { id: invite.matchId },
    select: { personAId: true, personBId: true },
  });
  if (!match) return new NextResponse("Not found", { status: 404 });
  const otherId = match.personAId === invite.personId ? match.personBId : match.personAId;

  const photo = await prisma.photo.findUnique({ where: { id } });
  if (!photo || photo.personId !== otherId || photo.status !== "approved") {
    return new NextResponse("Not found", { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await readUpload(id, ext, photo.storageUrl);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentTypeForExt(ext),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
