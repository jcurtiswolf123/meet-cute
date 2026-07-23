import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionPersonId } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Data export (access right): the signed-in member downloads everything we hold
// about them as JSON.
export async function GET() {
  const me = await getSessionPersonId();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const person = await prisma.person.findUnique({
    where: { id: me },
    include: {
      photos: true,
      prompts: true,
      vouchesReceived: { include: { voucher: { select: { name: true } } } },
      vouchesGiven: true,
      matchesAsA: true,
      matchesAsB: true,
      dinnerAttendance: { include: { dinner: true } },
      invitesSent: true,
    },
  });
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const blocks = await prisma.block.findMany({ where: { blockerId: me } });
  const reports = await prisma.report.findMany({ where: { reporterId: me } });

  // Strip storageUrl: it is an internal blob capability URL, not member data the
  // export should hand out (the image itself is reachable via /app, gated).
  const { photos, ...personRest } = person;
  const payload = {
    exportedAt: new Date().toISOString(),
    person: {
      ...personRest,
      photos: photos.map(({ storageUrl, ...photo }) => {
        void storageUrl;
        return photo;
      }),
    },
    blocks,
    reportsFiled: reports,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="meet-cute-my-data.json"',
      "Cache-Control": "no-store",
    },
  });
}
