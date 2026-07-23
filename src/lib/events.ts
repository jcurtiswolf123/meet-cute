// Events (curated dinners) shared logic, used by both the operator server
// actions and the co-pilot command layer so the behavior is identical whether
// an operator clicks a button or types "invite Maya and Alex to the next dinner".
import { prisma } from "./prisma";
import { eventInviteEmail } from "./email";
import { makeDeliveryKey, queueEmailDelivery } from "./delivery";

export type NewEvent = {
  city: string; // "NYC" | "SF"
  date: Date;
  venue: string;
  theme?: string | null;
  capacity?: number;
  notes?: string | null;
};

export function formatWhen(date: Date): string {
  return date.toLocaleString("en-US", {
    weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function appBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://meet-cute.fly.dev").replace(/\/$/, "");
}

export async function createEventRecord(e: NewEvent) {
  const city = e.city.toLowerCase().includes("franc") || e.city.toUpperCase() === "SF" ? "SF" : "NYC";
  return prisma.dinner.create({
    data: {
      city,
      date: e.date,
      venue: e.venue.slice(0, 120),
      theme: e.theme?.slice(0, 120) || "Meet Cute Dinner",
      capacity: e.capacity && e.capacity > 0 ? Math.min(e.capacity, 100) : 12,
      notes: e.notes?.slice(0, 2000) || null,
      status: "open",
    },
  });
}

const ATTENDEE_STATUSES = new Set(["invited", "confirmed", "declined", "attended", "noshow"]);
const CAPACITY_STATUSES = ["confirmed", "attended"];

/** Change one RSVP while holding a database lock on the dinner row.
 *  Concurrent confirmations serialize at this point, so capacity cannot be
 *  exceeded even when two people take the last seat at the same time. */
export async function setDinnerAttendeeStatus(attendeeId: string, requestedStatus: string) {
  const status = ATTENDEE_STATUSES.has(requestedStatus) ? requestedStatus : "invited";
  const target = await prisma.dinnerAttendee.findUnique({
    where: { id: attendeeId },
    select: { dinnerId: true },
  });
  if (!target) throw new Error("Invitation not found.");

  return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${target.dinnerId}, 0))::text`;
      const attendee = await tx.dinnerAttendee.findUnique({
        where: { id: attendeeId },
        select: { id: true, dinnerId: true, status: true },
      });
      if (!attendee) throw new Error("Invitation not found.");

      const dinner = await tx.dinner.findUnique({
        where: { id: attendee.dinnerId },
        select: { capacity: true, status: true },
      });
      if (!dinner) throw new Error("Event not found.");

      const confirmed = await tx.dinnerAttendee.count({
        where: {
          dinnerId: attendee.dinnerId,
          status: { in: CAPACITY_STATUSES },
        },
      });
      const wasCounted = CAPACITY_STATUSES.includes(attendee.status);
      const willCount = CAPACITY_STATUSES.includes(status);
      if (willCount && !wasCounted && confirmed >= dinner.capacity) {
        throw new Error("This event is full.");
      }

      const updated = await tx.dinnerAttendee.update({
        where: { id: attendee.id },
        data: { status },
      });
      const nextConfirmed = confirmed + (willCount ? 1 : 0) - (wasCounted ? 1 : 0);
      const nextDinnerStatus =
        dinner.status === "done"
          ? "done"
          : nextConfirmed >= dinner.capacity
            ? "full"
            : dinner.status === "full"
              ? "open"
              : dinner.status;
      if (nextDinnerStatus !== dinner.status) {
        await tx.dinner.update({
          where: { id: attendee.dinnerId },
          data: { status: nextDinnerStatus },
        });
      }
      return updated;
  });
}

/** Remove one attendee under the same dinner lock used by RSVP changes.
 *  Recounts capacity so a previously full dinner reopens immediately. */
export async function removeDinnerAttendee(attendeeId: string): Promise<string | null> {
  const target = await prisma.dinnerAttendee.findUnique({
    where: { id: attendeeId },
    select: { dinnerId: true },
  });
  if (!target) return null;

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${target.dinnerId}, 0))::text`;
    const attendee = await tx.dinnerAttendee.findUnique({
      where: { id: attendeeId },
      select: { dinnerId: true },
    });
    if (!attendee) return null;
    await tx.dinnerAttendee.delete({ where: { id: attendeeId } });
    const dinner = await tx.dinner.findUnique({
      where: { id: attendee.dinnerId },
      select: { capacity: true, status: true },
    });
    if (dinner && dinner.status !== "done") {
      const confirmed = await tx.dinnerAttendee.count({
        where: { dinnerId: attendee.dinnerId, status: { in: CAPACITY_STATUSES } },
      });
      const nextStatus =
        confirmed >= dinner.capacity ? "full" : dinner.status === "full" ? "open" : dinner.status;
      if (nextStatus !== dinner.status) {
        await tx.dinner.update({
          where: { id: attendee.dinnerId },
          data: { status: nextStatus },
        });
      }
    }
    return attendee.dinnerId;
  });
}

/**
 * Invite members to an event: create attendee rows (skipping anyone already on
 * the list) and email each new invitee. Returns who was added and how many
 * emails went out. Email is best-effort and never blocks the invite.
 */
export async function inviteToEvent(
  dinnerId: string,
  personIds: string[],
): Promise<{ invited: { id: string; name: string }[]; alreadyOn: number; emailed: number }> {
  const dinner = await prisma.dinner.findUnique({ where: { id: dinnerId } });
  if (!dinner) throw new Error("Event not found.");

  const ids = [...new Set(personIds)].filter(Boolean);
  if (!ids.length) return { invited: [], alreadyOn: 0, emailed: 0 };

  const people = await prisma.person.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true },
  });

  const existing = await prisma.dinnerAttendee.findMany({
    where: { dinnerId, personId: { in: ids } },
    select: { personId: true },
  });
  const onList = new Set(existing.map((a) => a.personId));
  const toAdd = people.filter((p) => !onList.has(p.id));

  if (toAdd.length) {
    await prisma.dinnerAttendee.createMany({
      data: toAdd.map((p) => ({ dinnerId, personId: p.id, status: "invited" })),
      skipDuplicates: true,
    });
  }

  const when = formatWhen(dinner.date);
  const link = `${appBase()}/app/events`;
  let emailed = 0;
  await Promise.all(
    toAdd.map(async (p) => {
      try {
        if (!p.email) return; // phone-only matchee: nothing to email
        const { subject, html, text } = eventInviteEmail({
          name: p.name, theme: dinner.theme || "Meet Cute Dinner", city: dinner.city,
          venue: dinner.venue, when, link,
        });
        await queueEmailDelivery({
          kind: "event_invite",
          to: p.email,
          subject,
          html,
          text,
          idempotencyKey: makeDeliveryKey("event-invite", dinnerId, p.id),
          personId: p.id,
        });
        emailed += 1;
      } catch {
        /* best-effort */
      }
    }),
  );

  return { invited: toAdd.map((p) => ({ id: p.id, name: p.name })), alreadyOn: onList.size, emailed };
}

/** Resolve an event referenced loosely in text (by theme/venue, city + "next",
 *  or just "next/upcoming dinner"). Returns the best single match or null. */
export async function findEvent(text: string): Promise<{ id: string; label: string } | null> {
  const lc = text.toLowerCase();
  const upcoming = await prisma.dinner.findMany({
    where: { status: { not: "done" } },
    orderBy: { date: "asc" },
  });
  if (!upcoming.length) return null;

  const cityHint = /\bsf\b|san franc/.test(lc) ? "SF" : /\bnyc\b|new york/.test(lc) ? "NYC" : null;

  // Strongest signal: theme or venue mentioned verbatim.
  for (const d of upcoming) {
    const theme = (d.theme || "").toLowerCase();
    const venue = d.venue.toLowerCase();
    if ((theme && theme.length > 3 && lc.includes(theme)) || (venue.length > 3 && lc.includes(venue))) {
      return { id: d.id, label: `${d.theme} (${d.city}, ${formatWhen(d.date)})` };
    }
  }
  // Otherwise the soonest upcoming (optionally filtered by a city hint).
  const pool = cityHint ? upcoming.filter((d) => d.city === cityHint) : upcoming;
  const pick = pool[0] || upcoming[0];
  return pick ? { id: pick.id, label: `${pick.theme} (${pick.city}, ${formatWhen(pick.date)})` } : null;
}
