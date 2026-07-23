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

// People this member has actually been introduced to: a match that reached
// mutual yes or connected. This is the ONLY set whose profiles a member may view
// (see the member visibility rule: application + own profile + connected
// profiles only). Excludes anyone in a block relationship, in either direction.
const CONNECTED_STAGES = ["connected"];

export async function connectedPersonIds(meId: string): Promise<string[]> {
  const [matches, blocks] = await Promise.all([
    prisma.match.findMany({
      where: { stage: { in: CONNECTED_STAGES }, OR: [{ personAId: meId }, { personBId: meId }] },
      select: { personAId: true, personBId: true },
    }),
    prisma.block.findMany({
      where: { OR: [{ blockerId: meId }, { blockedId: meId }] },
      select: { blockerId: true, blockedId: true },
    }),
  ]);
  const blocked = new Set<string>();
  for (const b of blocks) blocked.add(b.blockerId === meId ? b.blockedId : b.blockerId);

  const ids = new Set<string>();
  for (const m of matches) {
    const other = m.personAId === meId ? m.personBId : m.personAId;
    if (other !== meId && !blocked.has(other)) ids.add(other);
  }
  return [...ids];
}

/** Guard: may `meId` view `otherId`'s profile? True only if they share a
 *  connected/mutual match (and no block exists). */
export async function isConnectedTo(meId: string, otherId: string): Promise<boolean> {
  if (meId === otherId) return true;
  const ids = await connectedPersonIds(meId);
  return ids.includes(otherId);
}

export async function vouchesFor(personId: string) {
  return prisma.vouch.findMany({
    where: { subjectId: personId },
    include: { voucher: { select: { id: true, name: true, isAmbassador: true } } },
    orderBy: { createdAt: "desc" },
  });
}
