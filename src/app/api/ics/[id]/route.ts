import { prisma } from "@/lib/prisma";
import { getSessionPersonId } from "@/lib/auth";
import { icsForThread } from "@/lib/concierge";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getSessionPersonId();
  const t = await prisma.conciergeThread.findUnique({
    where: { id },
    include: { venue: true, match: { include: { personA: true, personB: true } } },
  });
  if (!t || !t.confirmedSlot || !t.match) return new Response("Not found", { status: 404 });
  if (me !== t.match.personAId && me !== t.match.personBId) return new Response("Forbidden", { status: 403 });

  const other = t.match.personAId === me ? t.match.personB : t.match.personA;
  const ics = icsForThread({
    confirmedSlot: t.confirmedSlot,
    id: t.id,
    venueName: t.venue?.name ?? "Meet Cute",
    withName: other.name.split(" ")[0],
  });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="meet-cute-date.ics"`,
    },
  });
}
