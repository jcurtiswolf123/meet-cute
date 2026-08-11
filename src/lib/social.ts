// The mutual-friend graph, derived from data we already own (no LinkedIn API,
// no contacts scrape): referrals, dinner co-attendance, and explicit vouches.
// This is the v1 answer to "pull from contacts or LinkedIn" - higher trust,
// zero integration risk. Contacts-matching can layer on in a mobile v2.
import { prisma } from "./prisma";

// Set of person ids socially connected to `personId`.
//
// Three independent sources - who referred whom, who sat at the same dinner,
// and who vouched for whom - so all three are asked at once. They were asked in
// sequence, and dinner co-attendance was two of those trips: the dinners this
// person attended, then everyone else at them. One query with a nested filter
// answers both halves, so the whole function is one round trip deep instead of
// four. Across a region gap that is the difference between 50ms and 200ms, on
// every profile the operator opens.
export async function connectionsOf(personId: string): Promise<Set<string>> {
  const ids = new Set<string>();

  const [person, coAttendees, vouches] = await Promise.all([
    prisma.person.findUnique({
      where: { id: personId },
      relationLoadStrategy: "join",
      select: { referredById: true, referred: { select: { id: true } } },
    }),
    prisma.dinnerAttendee.findMany({
      where: { dinner: { attendees: { some: { personId } } }, NOT: { personId } },
      select: { personId: true },
    }),
    prisma.vouch.findMany({
      where: { OR: [{ voucherId: personId }, { subjectId: personId }] },
      select: { voucherId: true, subjectId: true },
    }),
  ]);

  if (person?.referredById) ids.add(person.referredById);
  person?.referred.forEach((r) => ids.add(r.id));
  coAttendees.forEach((c) => ids.add(c.personId));
  // Either direction implies they know each other.
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
