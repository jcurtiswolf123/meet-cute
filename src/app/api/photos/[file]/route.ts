import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionSubject } from "@/lib/auth";
import { readUpload, contentTypeForExt } from "@/lib/uploads";
import { isConnectedTo } from "@/lib/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// How long a browser may reuse an approved photo it has already been given.
//
// This route is the reason the directory felt heavy out of proportion to its
// size. Every avatar on the page is a separate authenticated request that has
// to reach a database in another region before a single byte of image moves,
// and the roster draws one per member. At a one-hour cache the operator who
// keeps the studio open all day paid for that again every hour, on every page.
//
// A day is the trade: an image whose moderation is reversed can still appear,
// for up to a day, to the one viewer who had already been shown it and is
// already allowed to see it. Nothing new leaks - authorization still runs on
// every request that is not already in that viewer's own cache - and anything
// not yet approved is never stored at all.
const APPROVED_PHOTO_MAX_AGE_SECONDS = 86_400;

// Serve an uploaded photo. Requires a session. Approved photos are visible to
// any signed-in member; pending or rejected photos only to the owner or an
// operator, so unmoderated images never leak.
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  // Authorization only: this route never renders the viewer's own profile, and
  // reading their photos and prompts to decide whether they may see somebody
  // else's avatar cost two extra round trips per image on the page.
  const me = await getSessionSubject();
  if (!me) return new NextResponse("Unauthorized", { status: 401 });

  const { file } = await params;
  const dot = file.lastIndexOf(".");
  if (dot < 0) return new NextResponse("Not found", { status: 404 });
  const id = file.slice(0, dot);
  const ext = file.slice(dot + 1);

  // Strict validation before anything touches the filesystem: id must be a cuid
  // shape and ext an allowlisted image type. Defends against path traversal even
  // though the dynamic segment cannot contain a slash.
  if (!/^[a-z0-9]{20,40}$/i.test(id) || !["jpg", "png", "webp"].includes(ext)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const photo = await prisma.photo.findUnique({
    where: { id },
    relationLoadStrategy: "join",
    include: { asset: { select: { bytes: true } } },
  });
  if (!photo) return new NextResponse("Not found", { status: 404 });

  const isOwner = photo.personId === me.id;
  if (photo.status !== "approved" && !isOwner && !me.isOperator) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!isOwner && !me.isOperator && !(await isConnectedTo(me.id, photo.personId))) {
    return new NextResponse("Not found", { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await readUpload(id, ext, photo.storageUrl, photo.asset?.bytes);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentTypeForExt(ext),
      // Private, so no shared cache ever holds a member's face. Anything still
      // awaiting moderation is not stored at all.
      "Cache-Control":
        photo.status === "approved"
          ? `private, max-age=${APPROVED_PHOTO_MAX_AGE_SECONDS}`
          : "private, no-store",
    },
  });
}
