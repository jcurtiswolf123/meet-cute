import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentPerson } from "@/lib/auth";
import { readUpload, contentTypeForExt } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serve an uploaded photo. Requires a session. Approved photos are visible to
// any signed-in member; pending or rejected photos only to the owner or an
// operator, so unmoderated images never leak.
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const me = await getCurrentPerson();
  if (!me) return new NextResponse("Unauthorized", { status: 401 });

  const { file } = await params;
  const dot = file.lastIndexOf(".");
  if (dot < 0) return new NextResponse("Not found", { status: 404 });
  const id = file.slice(0, dot);
  const ext = file.slice(dot + 1);

  const photo = await prisma.photo.findUnique({ where: { id } });
  if (!photo) return new NextResponse("Not found", { status: 404 });

  const isOwner = photo.personId === me.id;
  if (photo.status !== "approved" && !isOwner && !me.isOperator) {
    return new NextResponse("Not found", { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await readUpload(id, ext);
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
