// The mutual-friend graph, derived from data we already own (no LinkedIn API,
// no contacts scrape): referrals, dinner co-attendance, and explicit vouches.
// This is the v1 answer to "pull from contacts or LinkedIn" - higher trust,
// zero integration risk. Contacts-matching can layer on in a mobile v2.
import { prisma } from "./prisma";

// Set of person ids socially connected to `personId`.
export async function connectionsOf(personId: string): Promise<Set<string>> {
  const ids = new Set<string>();

  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { referredById: true, referred: { select: { id: true } } },
  });
  if (person?.referredById) ids.add(person.referredById);
  person?.referred.forEach((r) => ids.add(r.id));

  // dinner co-attendance
  const myDinners = await prisma.dinnerAttendee.findMany({
    where: { personId },
    select: { dinnerId: true },
  });
  if (myDinners.length) {
    const co = await prisma.dinnerAttendee.findMany({
      where: { dinnerId: { in: myDinners.map((d) => d.dinnerId) }, NOT: { personId } },
      select: { personId: true },
    });
    co.forEach((c) => ids.add(c.personId));
  }

  // explicit vouches (either direction implies they know each other)
  const vouches = await prisma.vouch.findMany({
    where: { OR: [{ voucherId: personId }, { subjectId: personId }] },
    select: { voucherId: true, subjectId: true },
  });
  vouches.forEach((v) => {
    ids.add(v.voucherId === personId ? v.subjectId : v.voucherId);
  });

  ids.delete(personId);
  return ids;
}

export async function mutualFriends(aId: string, bId: string) {
  const [ca, cb] = await Promise.all([connectionsOf(aId), connectionsOf(bId)]);
  const shared = [...ca].filter((id) => cb.has(id));
  if (!shared.length) return [];
  return prisma.person.findMany({
    where: { id: { in: shared } },
    select: { id: true, name: true, city: true, isAmbassador: true },
  });
}

export async function vouchesFor(personId: string) {
  return prisma.vouch.findMany({
    where: { subjectId: personId },
    include: { voucher: { select: { id: true, name: true, isAmbassador: true } } },
    orderBy: { createdAt: "desc" },
  });
}
