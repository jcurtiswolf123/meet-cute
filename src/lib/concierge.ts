// The concierge bot. Principle from the plan: PROPOSE, DON'T COORDINATE.
// The bot never asks an open question. It names a venue and offers specific
// slots; both tap; overlap confirms; no overlap gets one more round; then a
// human steps in. Holds expire, which creates urgency and a reason to nudge.
import { prisma } from "./prisma";
import { buildIcs } from "./ics";

const HOLD_HOURS = 48;
const ROUND_CAP = 2;
const SLOTS_PER_ROUND = 3;

type Now = Date;

// Pick the next N future datetimes from a venue's standing held slots.
export function nextSlots(
  venueSlots: { dayOfWeek: number; time: string }[],
  count: number,
  from: Now,
  skip = 0
): string[] {
  const out: Date[] = [];
  const start = new Date(from.getTime());
  let dayOffset = 1; // never propose same-day
  while (out.length < count + skip && dayOffset < 30) {
    const d = new Date(start);
    d.setDate(d.getDate() + dayOffset);
    for (const s of venueSlots) {
      if (s.dayOfWeek === d.getDay()) {
        const [h, m] = s.time.split(":").map(Number);
        const slot = new Date(d);
        slot.setHours(h, m, 0, 0);
        if (slot > from) out.push(slot);
      }
    }
    dayOffset++;
  }
  out.sort((a, b) => a.getTime() - b.getTime());
  return out.slice(skip, skip + count).map((d) => d.toISOString());
}

async function say(
  threadId: string,
  toPersonId: string | null,
  body: string,
  kind = "text"
) {
  await prisma.conciergeMessage.create({
    data: { threadId, toPersonId, body, kind, direction: "out" },
  });
}

function slotLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// Called when a Match flips to mutual_yes.
export async function startThread(matchId: string, now: Now = new Date()) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { personA: true, personB: true, thread: true },
  });
  if (!match || match.thread) return match?.thread ?? null;

  const venue = await prisma.venue.findFirst({
    where: { city: match.personA.city, partner: true },
    include: { slots: { where: { held: true } } },
  });
  if (!venue) throw new Error(`No partner venue with held slots in ${match.personA.city}`);

  const slots = nextSlots(venue.slots, SLOTS_PER_ROUND, now);
  const holdsUntil = new Date(now.getTime() + HOLD_HOURS * 3600 * 1000);

  const thread = await prisma.conciergeThread.create({
    data: {
      matchId,
      venueId: venue.id,
      state: "proposing",
      round: 1,
      proposedSlots: JSON.stringify(slots),
      holdsUntil,
    },
  });

  const tapList = slots.map(slotLabel).join("  ·  ");
  for (const [me, them] of [
    [match.personA, match.personB],
    [match.personB, match.personA],
  ] as const) {
    await say(
      thread.id,
      me.id,
      `You matched with ${them.name.split(" ")[0]} 🎉 I've got you a table at ${venue.name}. Tap a time:\n${tapList}\n(These hold for 48 hours.)`,
      "propose"
    );
  }
  return thread;
}

// A member taps a slot.
export async function recordPick(threadId: string, personId: string, slotIso: string) {
  const thread = await prisma.conciergeThread.findUnique({
    where: { id: threadId },
    include: { match: { include: { personA: true, personB: true } }, venue: true },
  });
  if (!thread || !thread.match) throw new Error("thread not found");
  // Only a participant of this match may pick a slot. Without this, any member
  // could write into a stranger's thread and force-confirm their date.
  const isA = thread.match.personAId === personId;
  const isB = thread.match.personBId === personId;
  if (!isA && !isB) throw new Error("not your thread");
  const slots: string[] = JSON.parse(thread.proposedSlots ?? "[]");
  if (!slots.includes(slotIso)) throw new Error("slot not on offer");
  await prisma.conciergeMessage.create({
    data: {
      threadId,
      direction: "in",
      toPersonId: personId,
      body: `picked ${slotLabel(slotIso)}`,
      kind: "system",
    },
  });
  const data = isA ? { aPick: slotIso } : { bPick: slotIso };
  const updated = await prisma.conciergeThread.update({ where: { id: threadId }, data });

  if (updated.aPick && updated.bPick) {
    if (updated.aPick === updated.bPick) {
      await confirm(threadId, updated.aPick);
    } else {
      await reRound(threadId);
    }
  }
  return prisma.conciergeThread.findUnique({ where: { id: threadId } });
}

async function reRound(threadId: string, now: Now = new Date()) {
  const thread = await prisma.conciergeThread.findUnique({
    where: { id: threadId },
    include: { match: { include: { personA: true, personB: true } }, venue: { include: { slots: true } } },
  });
  if (!thread || !thread.venue || !thread.match) return;

  if (thread.round >= ROUND_CAP) {
    await prisma.conciergeThread.update({ where: { id: threadId }, data: { state: "handoff" } });
    await say(
      threadId,
      null,
      `Slots didn't line up after two rounds - a matchmaker is jumping in to sort the timing. 💛`,
      "system"
    );
    return;
  }

  const prior: string[] = JSON.parse(thread.proposedSlots ?? "[]");
  const fresh = nextSlots(
    thread.venue.slots.filter((s) => s.held),
    SLOTS_PER_ROUND,
    now,
    prior.length
  );
  await prisma.conciergeThread.update({
    where: { id: threadId },
    data: {
      state: "round2",
      round: thread.round + 1,
      proposedSlots: JSON.stringify(fresh),
      aPick: null,
      bPick: null,
      holdsUntil: new Date(now.getTime() + HOLD_HOURS * 3600 * 1000),
    },
  });
  const tapList = fresh.map(slotLabel).join("  ·  ");
  for (const me of [thread.match.personA, thread.match.personB]) {
    await say(
      threadId,
      me.id,
      `Those didn't overlap - no problem. Fresh times at ${thread.venue.name}:\n${tapList}`,
      "propose"
    );
  }
}

export async function confirm(threadId: string, slotIso: string) {
  const thread = await prisma.conciergeThread.findUnique({
    where: { id: threadId },
    include: { match: { include: { personA: true, personB: true } }, venue: true },
  });
  if (!thread || !thread.match || !thread.venue) return;
  const start = new Date(slotIso);

  await prisma.conciergeThread.update({
    where: { id: threadId },
    data: { state: "confirmed", confirmedSlot: start },
  });
  await prisma.match.update({
    where: { id: thread.matchId },
    data: { stage: "date_scheduled" },
  });

  for (const [me, them] of [
    [thread.match.personA, thread.match.personB],
    [thread.match.personB, thread.match.personA],
  ] as const) {
    await say(
      threadId,
      me.id,
      `You're set: ${slotLabel(slotIso)} with ${them.name.split(" ")[0]} at ${thread.venue.name}. Ask for the Meet Cute table. I'll send a calendar invite + a nudge that morning. 🥂`,
      "confirm"
    );
  }
}

// Operator override: open a thread if needed and book the soonest held slot
// immediately, without waiting for both members to tap. Used by the co-pilot so
// an operator can say "book the date for X" and have a table confirmed.
export async function autoBook(matchId: string, now: Now = new Date()) {
  let thread = await prisma.conciergeThread.findUnique({
    where: { matchId },
    include: { venue: true, match: { include: { personA: true, personB: true } } },
  });
  if (!thread) {
    await startThread(matchId, now);
    thread = await prisma.conciergeThread.findUnique({
      where: { matchId },
      include: { venue: true, match: { include: { personA: true, personB: true } } },
    });
  }
  if (!thread || !thread.venue || !thread.match) throw new Error("could not open a concierge thread");
  const slots: string[] = JSON.parse(thread.proposedSlots ?? "[]");
  const slot = slots[0];
  if (!slot) throw new Error("no held slots available to book");
  await confirm(thread.id, slot);
  return {
    venue: thread.venue.name,
    time: slotLabel(slot),
    a: thread.match.personA.name,
    b: thread.match.personB.name,
  };
}

export function icsForThread(t: {
  confirmedSlot: Date;
  id: string;
  venueName: string;
  withName: string;
}): string {
  return buildIcs({
    start: t.confirmedSlot,
    title: `Meet Cute date with ${t.withName}`,
    location: t.venueName,
    description: `Ask for the Meet Cute table. Have fun.`,
    uid: t.id,
  });
}

// Cron-style sweep. `now` is injectable so the demo can fast-forward time.
export async function tick(now: Now = new Date()) {
  const log: string[] = [];
  const threads = await prisma.conciergeThread.findMany({
    include: { match: { include: { personA: true, personB: true } }, venue: true },
  });

  for (const t of threads) {
    if (!t.match) continue;

    // confirmed: morning-of + post-date check-in
    if (t.state === "confirmed" && t.confirmedSlot) {
      const sameDay = t.confirmedSlot.toDateString() === now.toDateString() && now < t.confirmedSlot;
      const lastReminder = await prisma.conciergeMessage.findFirst({
        where: { threadId: t.id, kind: "reminder" },
      });
      if (sameDay && !lastReminder) {
        await say(
          t.id,
          null,
          `Tonight at ${t.confirmedSlot.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}, ${t.venue?.name}, ask for the Meet Cute table. Have fun 🥂`,
          "reminder"
        );
        log.push(`reminder sent for ${t.id}`);
      }
      const dayAfter = now.getTime() - t.confirmedSlot.getTime() > 24 * 3600 * 1000;
      if (dayAfter) {
        await say(
          t.id,
          null,
          `How did it go? Tap: 🔥 great · 🙂 nice · 😐 not a fit. (Feeds straight back to your matchmaker.)`,
          "checkin"
        );
        await prisma.conciergeThread.update({ where: { id: t.id }, data: { state: "post_date" } });
        await prisma.match.update({ where: { id: t.matchId }, data: { stage: "first_date" } });
        log.push(`post-date check-in for ${t.id}`);
      }
      continue;
    }

    // proposing / round2: nudge once when a hold is expiring, then hand off
    if ((t.state === "proposing" || t.state === "round2") && t.holdsUntil) {
      const expired = now > t.holdsUntil;
      if (expired && !t.lastNudgeAt) {
        await say(
          t.id,
          null,
          `Your table holds are about to lapse - tap a time and I'll lock it in. ⏳`,
          "reminder"
        );
        await prisma.conciergeThread.update({
          where: { id: t.id },
          data: { lastNudgeAt: now, holdsUntil: new Date(now.getTime() + 24 * 3600 * 1000) },
        });
        log.push(`nudge sent for ${t.id}`);
      } else if (expired && t.lastNudgeAt && now.getTime() - t.lastNudgeAt.getTime() > 24 * 3600 * 1000) {
        await prisma.conciergeThread.update({ where: { id: t.id }, data: { state: "handoff" } });
        await say(t.id, null, `Flagging a matchmaker to reach out personally. 💛`, "system");
        log.push(`handoff for ${t.id}`);
      }
    }
  }
  return log;
}
