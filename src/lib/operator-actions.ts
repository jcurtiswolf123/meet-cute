// Operator action layer for the co-pilot.
//
// The chat model (Llama 3.1 8B on the free tier) has no reliable tool-calling,
// so instead of trusting the model to call functions, we deterministically
// detect clear operator imperatives ("book the date for X", "match X and Y",
// "note on X: ...") and execute them against the database / concierge. Every
// action is operator-gated (the /api/copilot route already requires an
// operator), reversible, and echoed back so the operator sees exactly what
// happened. Anything that is not a clear command falls through to the normal
// RAG answer.
import { prisma } from "./prisma";
import { autoBook } from "./concierge";
import { findEvent, inviteToEvent, createEventRecord, formatWhen } from "./events";

export type ActionResult = { handled: boolean; text?: string };

// Find up to `max` active roster members named in the text, in order of mention.
async function peopleInText(text: string, max = 2) {
  const people = await prisma.person.findMany({
    where: { isOperator: false, isAmbassador: false, isCoach: false },
    select: { id: true, name: true, status: true },
  });
  const lc = text.toLowerCase();
  // longest names first so "David Cohen" wins over "David"
  people.sort((a, b) => b.name.length - a.name.length);
  const found: { id: string; name: string; status: string; at: number }[] = [];
  const used = new Set<string>();
  for (const p of people) {
    const full = p.name.toLowerCase();
    const first = full.split(" ")[0];
    const safe = first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let at = lc.indexOf(full);
    if (at < 0) {
      const m = new RegExp(`\\b${safe}\\b`).exec(lc);
      at = m ? m.index : -1;
    }
    if (at >= 0 && !used.has(p.id)) {
      // avoid double-counting overlapping name spans
      if (!found.some((f) => Math.abs(f.at - at) < 2)) {
        found.push({ ...p, at });
        used.add(p.id);
      }
    }
  }
  return found.sort((a, b) => a.at - b.at).slice(0, max);
}

async function activeMatchFor(personId: string) {
  // The match most ready to book: prefer mutual_yes / suggested, newest first.
  return prisma.match.findFirst({
    where: {
      OR: [{ personAId: personId }, { personBId: personId }],
      stage: { in: ["mutual_yes", "suggested", "date_scheduled"] },
    },
    orderBy: { updatedAt: "desc" },
    include: { personA: { select: { name: true } }, personB: { select: { name: true } } },
  });
}

/** Try to handle the operator's message as a command. Returns handled=false to
 *  fall through to the normal co-pilot answer. */
export async function tryOperatorAction(operatorId: string, text: string): Promise<ActionResult> {
  const q = text.trim();
  const lc = q.toLowerCase();

  const wantsBook = /\b(book|auto[-\s]?book|confirm|schedule|set up|lock in)\b.*\b(date|table|restaurant|reservation|dinner|time)\b/.test(lc)
    || /\b(book|schedule)\b.*\bfor\b/.test(lc);
  const wantsInvite = /\binvite\b/.test(lc) && /\bto\b/.test(lc);
  const wantsCreateEvent = /\b(create|add|schedule|set ?up|plan|host)\b.*\b(dinner|event|gathering|party)\b/.test(lc);
  const wantsMatch = /\b(match|suggest|introduce|pair|set up)\b/.test(lc) && /\b(and|with|to)\b/.test(lc) && !wantsInvite;
  const wantsNote = /\b(add )?note\b.*:/.test(lc) || /^note /.test(lc);
  const wantsApprovePhotos = /\bapprove\b.*\bphoto/.test(lc);
  const wantsCloseMatch = /\b(close|end|exit|cancel|pass on)\b.*\bmatch\b/.test(lc);
  const wantsAttention = /\b(what|anything).*(need|attention|do next|priorit|to do|on my plate)\b/.test(lc)
    || /\bwhat should i (do|work on)\b/.test(lc);

  // --- operator dashboard in chat: what needs attention -----------------
  if (wantsAttention) {
    const [pendingPhotos, openReports, mutualReady] = await Promise.all([
      prisma.photo.count({ where: { status: "pending" } }),
      prisma.report.count({ where: { status: "open" } }),
      prisma.match.count({ where: { stage: "mutual_yes" } }),
    ]);
    // singles with no suggestion in 60+ days
    const since = new Date(Date.now() - 60 * 24 * 3600 * 1000);
    const recent = await prisma.match.findMany({ select: { personAId: true, personBId: true, createdAt: true } });
    const last = new Map<string, Date>();
    recent.forEach((m) => [m.personAId, m.personBId].forEach((pid) => {
      const c = last.get(pid);
      if (!c || m.createdAt > c) last.set(pid, m.createdAt);
    }));
    const actives = await prisma.person.count({ where: { status: "active", isOperator: false, isAmbassador: false, isCoach: false } });
    const stale = (await prisma.person.findMany({
      where: { status: "active", isOperator: false, isAmbassador: false, isCoach: false },
      select: { id: true },
    })).filter((p) => !last.get(p.id) || last.get(p.id)! < since).length;
    return {
      handled: true,
      text: [
        "Here is what needs you:",
        `- ${pendingPhotos} photo${pendingPhotos === 1 ? "" : "s"} to moderate`,
        `- ${openReports} open report${openReports === 1 ? "" : "s"}`,
        `- ${mutualReady} mutual-yes match${mutualReady === 1 ? "" : "es"} ready to book (say "book the date for <name>")`,
        `- ${stale} of ${actives} active singles have no suggestion in 60+ days`,
      ].join("\n"),
    };
  }

  // --- note on a person --------------------------------------------------
  if (wantsNote) {
    const people = await peopleInText(q, 1);
    const body = q.slice(q.indexOf(":") + 1).trim();
    if (people[0] && body) {
      await prisma.note.create({
        data: { subjectId: people[0].id, authorId: operatorId, body: body.slice(0, 2000), kind: "general" },
      });
      return { handled: true, text: `Logged a note on ${people[0].name}.` };
    }
  }

  // --- book / confirm a date --------------------------------------------
  if (wantsBook) {
    const people = await peopleInText(q, 2);
    if (!people.length) {
      return { handled: true, text: "Who should I book for? Name the member, for example: book the date for Maya." };
    }
    const match = await activeMatchFor(people[0].id);
    if (!match) {
      return { handled: true, text: `No active match for ${people[0].name} to book. Suggest a match first.` };
    }
    try {
      const r = await autoBook(match.id);
      return {
        handled: true,
        text: `Booked: ${r.a} and ${r.b} at ${r.venue}, ${r.time}. Calendar invites and a morning-of nudge are set. The pipeline is now at date scheduled.`,
      };
    } catch (e) {
      return { handled: true, text: `Could not book that date: ${(e as Error).message}.` };
    }
  }

  // --- invite members to an event ----------------------------------------
  if (wantsInvite) {
    const people = await peopleInText(q, 12);
    if (!people.length) {
      return { handled: true, text: "Who should I invite? Name the members, for example: invite Maya and Alex to the next NYC dinner." };
    }
    const event = await findEvent(q);
    if (!event) {
      return { handled: true, text: "I don't see an upcoming event to invite them to. Create one in Studio > Events (or say 'create a dinner...'), then invite." };
    }
    const r = await inviteToEvent(event.id, people.map((p) => p.id));
    if (!r.invited.length) {
      return { handled: true, text: `Everyone you named is already on the list for ${event.label}.` };
    }
    const names = r.invited.map((p) => p.name).join(", ");
    return {
      handled: true,
      text: `Invited ${names} to ${event.label}. ${r.emailed} invite email${r.emailed === 1 ? "" : "s"} sent${r.alreadyOn ? `, ${r.alreadyOn} were already on the list` : ""}.`,
    };
  }

  // --- create an event ---------------------------------------------------
  if (wantsCreateEvent) {
    const city = /\bsf\b|san franc/.test(lc) ? "SF" : "NYC";
    // venue: text after " at " up to a date/"on" boundary
    const venueMatch = q.match(/\bat\s+(.+?)(?:\s+on\s+|\s*,|\s+\d|$)/i);
    const venue = venueMatch?.[1]?.trim();
    // date: try the chunk after " on ", else any parseable tail
    const onMatch = q.match(/\bon\s+(.+)$/i);
    const candidate = onMatch?.[1]?.trim();
    let date: Date | null = null;
    for (const s of [candidate, q].filter(Boolean) as string[]) {
      const d = new Date(s);
      if (!Number.isNaN(d.getTime()) && d.getFullYear() > 2000) { date = d; break; }
    }
    if (!venue || !date) {
      return {
        handled: true,
        text: "I can create it. Give me a venue and a readable date, e.g. 'create a NYC dinner at Via Carota on 2026-07-12 7pm'. Or use Studio > Events for a date picker.",
      };
    }
    const ev = await createEventRecord({ city, date, venue });
    return {
      handled: true,
      text: `Created ${ev.theme} at ${venue} (${city}) for ${formatWhen(ev.date)}. Add invitees in Studio > Events, or say 'invite <names> to ${venue}'.`,
    };
  }

  // --- create a suggestion between two people ----------------------------
  if (wantsMatch) {
    const people = await peopleInText(q, 2);
    if (people.length < 2) {
      return {
        handled: true,
        text: "Name both members to match, for example: suggest Maya and David.",
      };
    }
    const [a, b] = people;
    const existing = await prisma.match.findFirst({
      where: {
        OR: [
          { personAId: a.id, personBId: b.id },
          { personAId: b.id, personBId: a.id },
        ],
      },
    });
    if (existing) return { handled: true, text: `${a.name} and ${b.name} are already in the pipeline.` };
    const blocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: a.id, blockedId: b.id },
          { blockerId: b.id, blockedId: a.id },
        ],
      },
    });
    if (blocked) return { handled: true, text: `Cannot match ${a.name} and ${b.name}: one has blocked the other.` };
    await prisma.match.create({
      data: { personAId: a.id, personBId: b.id, createdById: operatorId, stage: "suggested" },
    });
    return {
      handled: true,
      text: `Suggested ${a.name} and ${b.name}. It is in the pipeline at "suggested." Say "book the date for ${a.name.split(" ")[0]}" once they both opt in, or I can book it now.`,
    };
  }

  // --- approve a member's pending photos ---------------------------------
  if (wantsApprovePhotos) {
    const people = await peopleInText(q, 1);
    if (!people[0]) return { handled: true, text: "Whose photos should I approve? Name the member." };
    const r = await prisma.photo.updateMany({
      where: { personId: people[0].id, status: "pending" },
      data: { status: "approved" },
    });
    return {
      handled: true,
      text: r.count ? `Approved ${r.count} photo${r.count === 1 ? "" : "s"} for ${people[0].name}.` : `${people[0].name} has no pending photos.`,
    };
  }

  // --- close / end a match -----------------------------------------------
  if (wantsCloseMatch) {
    const people = await peopleInText(q, 1);
    if (!people[0]) return { handled: true, text: "Which member's match should I close? Name them." };
    const match = await activeMatchFor(people[0].id);
    if (!match) return { handled: true, text: `No active match for ${people[0].name}.` };
    await prisma.match.update({ where: { id: match.id }, data: { stage: "exit", exitReason: "operator_closed" } });
    const other = match.personAId === people[0].id ? match.personB.name : match.personA.name;
    return { handled: true, text: `Closed the match between ${people[0].name} and ${other}.` };
  }

  return { handled: false };
}
