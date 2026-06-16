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
  const wantsMatch = /\b(match|suggest|introduce|pair|set up)\b/.test(lc) && /\b(and|with|to)\b/.test(lc);
  const wantsNote = /\b(add )?note\b.*:/.test(lc) || /^note /.test(lc);

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

  return { handled: false };
}
