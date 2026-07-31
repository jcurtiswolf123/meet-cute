import { prisma } from "@/lib/prisma";
import { getSessionPersonId } from "@/lib/auth";
import { buildIcs } from "@/lib/ics";

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
  const ics = buildIcs({
    start: t.confirmedSlot,
    title: `Mutuals date with ${other.name.split(" ")[0]}`,
    location: t.venue?.name ?? "Mutuals",
    description: "Ask for the Mutuals table.",
    uid: t.id,
  });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="mutuals-date.ics"`,
    },
  });
}
