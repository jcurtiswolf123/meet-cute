// The matchmaker co-pilot: RAG over the roster + notes. Internal only.
import { prisma } from "./prisma";
import { embed, cosine, copilotReply, type ChatMsg } from "./ai";

export function profileText(p: {
  name: string;
  city: string;
  age?: number | null;
  gender?: string | null;
  seeking?: string | null;
  headline?: string | null;
  bio?: string | null;
  lookingFor?: string | null;
  dealBreakers?: string | null;
  neighborhood?: string | null;
  prompts?: { question: string; answer: string }[];
}): string {
  const parts = [
    `${p.name}, ${p.age ?? "?"}, ${p.city}${p.neighborhood ? ` (${p.neighborhood})` : ""}`,
    p.gender ? `Gender: ${p.gender}. Seeking: ${p.seeking ?? "?"}` : "",
    p.headline ? `Headline: ${p.headline}` : "",
    p.bio ? `Bio: ${p.bio}` : "",
    p.lookingFor ? `Looking for: ${p.lookingFor}` : "",
    p.dealBreakers ? `Deal-breakers: ${p.dealBreakers}` : "",
    ...(p.prompts ?? []).map((q) => `${q.question} ${q.answer}`),
  ];
  return parts.filter(Boolean).join(". ");
}

function parseEmbedding(s: string | null): number[] | null {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export async function searchRoster(query: string, limit = 6) {
  const qv = await embed(query);
  const people = await prisma.person.findMany({
    where: { status: "active", isOperator: false },
    include: { prompts: true, vouchesReceived: true },
  });
  const scored = people.map((p) => {
    const ev = parseEmbedding(p.embedding);
    const score = ev ? cosine(qv, ev) : 0;
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

function compatible(a: { gender?: string | null; seeking?: string | null }, b: { gender?: string | null; seeking?: string | null }) {
  const aSeeks = (a.seeking ?? "").toLowerCase();
  const bSeeks = (b.seeking ?? "").toLowerCase();
  const aOk = !b.gender || aSeeks.includes(b.gender.toLowerCase());
  const bOk = !a.gender || bSeeks.includes(a.gender.toLowerCase());
  return aOk && bOk;
}

// Top candidates for a given person: compatible, same city, not already matched.
export async function candidatesFor(personId: string, limit = 5) {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    include: { prompts: true },
  });
  if (!person) return [];
  const pv = parseEmbedding(person.embedding) ?? (await embed(profileText(person)));

  const existing = await prisma.match.findMany({
    where: { OR: [{ personAId: personId }, { personBId: personId }] },
    select: { personAId: true, personBId: true },
  });
  const taken = new Set<string>();
  existing.forEach((m) => {
    taken.add(m.personAId);
    taken.add(m.personBId);
  });

  const pool = await prisma.person.findMany({
    where: {
      status: "active",
      isOperator: false,
      city: person.city,
      id: { not: personId },
    },
    include: { prompts: true, vouchesReceived: true },
  });

  return pool
    .filter((c) => !taken.has(c.id) && compatible(person, c))
    .map((c) => {
      const cv = parseEmbedding(c.embedding);
      return { p: c, score: cv ? cosine(pv, cv) : 0, vouches: c.vouchesReceived.length };
    })
    .sort((a, b) => b.score + b.vouches * 0.02 - (a.score + a.vouches * 0.02))
    .slice(0, limit);
}

// Find a roster person referenced by name anywhere in the text.
async function findPersonInText(text: string) {
  const people = await prisma.person.findMany({
    where: { isOperator: false },
    select: { id: true, name: true },
  });
  const lc = text.toLowerCase();
  // longest-name-first so "David Cohen" beats "David"
  people.sort((a, b) => b.name.length - a.name.length);
  for (const p of people) {
    const first = p.name.split(" ")[0].toLowerCase();
    if (lc.includes(p.name.toLowerCase()) || new RegExp(`\\b${first}\\b`).test(lc)) {
      return prisma.person.findUnique({ where: { id: p.id }, include: { prompts: true } });
    }
  }
  return null;
}

// Local responder used when the LLM is unavailable. Routes intents against the
// live roster so the co-pilot is genuinely useful with zero AI spend.
export async function localAnswer(history: ChatMsg[]): Promise<string> {
  const q = (history.filter((m) => m.role === "user").at(-1)?.content ?? "").toLowerCase();
  const person = await findPersonInText(q);

  const wantsGap = /haven'?t.*(suggest|seen|matched)|who.*(stale|cold|idle|overdue)|no.*(suggestion|date).*(60|90|30|day)/.test(q);
  const wantsRecall = /(what did|recall|say after|feedback|how did|after (her|his|their) date)/.test(q);
  const wantsSummary = /(summar|catch me up|tell me about|what is .* looking for|history|overview)/.test(q);
  const wantsDraft = /(draft|write|compose).*(note|message|pitch|intro|email)/.test(q);
  const wantsFind = /(find|show|suggest|candidate|who.*fit|match for|matches for|good for)/.test(q);

  if (wantsGap) {
    const cutoff = new Date(Date.now() - 60 * 24 * 3600 * 1000);
    const recent = await prisma.match.findMany({ select: { personAId: true, personBId: true, createdAt: true } });
    const lastSuggested = new Map<string, Date>();
    recent.forEach((m) => {
      for (const pid of [m.personAId, m.personBId]) {
        const cur = lastSuggested.get(pid);
        if (!cur || m.createdAt > cur) lastSuggested.set(pid, m.createdAt);
      }
    });
    const active = await prisma.person.findMany({
      where: { status: "active", isOperator: false, isAmbassador: false, isCoach: false },
      select: { id: true, name: true, city: true },
    });
    const stale = active.filter((p) => !lastSuggested.get(p.id) || lastSuggested.get(p.id)! < cutoff);
    return [
      `${stale.length} active singles haven't been suggested to anyone in 60+ days:`,
      ...stale.map((p) => `  • ${p.name} (${p.city})`),
      stale.length ? "\nWant me to draft suggestions for any of them?" : "Everyone's been touched recently. Nice.",
    ].join("\n");
  }

  if ((wantsRecall || wantsSummary) && person) {
    const notes = await prisma.note.findMany({
      where: { subjectId: person.id },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { name: true } } },
    });
    const matches = await prisma.match.findMany({
      where: { OR: [{ personAId: person.id }, { personBId: person.id }] },
      include: { personA: { select: { name: true } }, personB: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    const lines = [`${person.name} (${person.city}, ${person.age ?? "?"}). ${person.headline ?? ""}`];
    if (wantsSummary && person.lookingFor) lines.push(`Looking for: ${person.lookingFor}`);
    if (matches.length) {
      lines.push("\nMatch history:");
      matches.forEach((m) => {
        const other = m.personAId === person.id ? m.personB.name : m.personA.name;
        lines.push(`  • ${other} - ${m.stage.replace(/_/g, " ")}`);
      });
    }
    if (notes.length) {
      lines.push("\nNotes:");
      notes.forEach((n) => lines.push(`  • [${n.kind}] ${n.body} (${n.author?.name ?? "system"})`));
    } else {
      lines.push("\nNo notes on file yet.");
    }
    return lines.join("\n");
  }

  if (person && (wantsFind || wantsDraft)) {
    const cands = await candidatesFor(person.id, 3);
    if (wantsDraft) {
      const c = cands[0];
      if (!c) return `No open candidates for ${person.name} right now.`;
      return [
        `Draft intro for ${person.name}:`,
        "",
        `"I have someone I think you'll genuinely like. ${c.p.name}, ${c.p.age}, ${c.p.headline}. ${c.p.lookingFor ?? ""} You both ${person.city === c.p.city ? `are in ${person.city}` : "travel a lot"} and want the same thing. Want to see the profile?"`,
        "",
        "Edit and send, or ask me to redraft.",
      ].join("\n");
    }
    return [
      `Top candidates for ${person.name}:`,
      ...cands.map(
        (c, i) =>
          `  ${i + 1}. ${c.p.name} (${c.p.age}, ${c.p.neighborhood ?? c.p.city}) - relevance ${c.score.toFixed(2)}, ${c.vouches} vouch${c.vouches === 1 ? "" : "es"}. ${c.p.headline ?? ""}`
      ),
      cands.length ? "\nReasoning: ranked by profile + stated-wants overlap, boosted by vouch count, same city, compatible and not yet matched." : "No open compatible candidates in the roster right now.",
    ].join("\n");
  }

  // default: semantic search
  const hits = await searchRoster(q, 5);
  return [
    "Closest roster matches to your query:",
    ...hits.map(({ p, score }) => `  • ${p.name} (${p.city}) - ${score.toFixed(2)}: ${p.headline ?? ""}`),
    "\n(Add credit to ANTHROPIC_API_KEY for full conversational reasoning. Retrieval above is live.)",
  ].join("\n");
}

export async function answer(history: ChatMsg[]) {
  const lastUser = history.filter((m) => m.role === "user").at(-1)?.content ?? "";

  const hits = await searchRoster(lastUser, 6);
  const notes = await prisma.note.findMany({
    orderBy: { createdAt: "desc" },
    take: 40,
    include: { subject: { select: { name: true } }, author: { select: { name: true } } },
  });

  const rosterBlock = hits
    .map(
      ({ p, score }) =>
        `- ${p.name} (${p.city}, age ${p.age ?? "?"}, ${p.gender ?? "?"} seeking ${p.seeking ?? "?"}; vouches ${p.vouchesReceived.length}; relevance ${score.toFixed(2)}): ${p.headline ?? ""} ${p.lookingFor ? `Wants: ${p.lookingFor}.` : ""}`
    )
    .join("\n");

  const lastUserLc = lastUser.toLowerCase();
  const noteBlock = notes
    .filter((n) => {
      const hay = `${n.subject.name} ${n.body}`.toLowerCase();
      return hay.split(/\s+/).some((w) => w.length > 3 && lastUserLc.includes(w));
    })
    .slice(0, 12)
    .map((n) => `- [${n.kind}] ${n.subject.name} (by ${n.author?.name ?? "system"}): ${n.body}`)
    .join("\n");

  const system = [
    "You are the Meet Cute matchmaker co-pilot - an internal assistant for Jess, Zoe, and the SF lead.",
    "You help run a premium, curated matchmaking roster. You are warm, concise, and decisive, like a great human matchmaker.",
    "You can: find candidates, draft outreach notes, recall facts from notes, summarize a person's history, and rank suggestions with reasoning.",
    "Only use the roster facts and notes provided below. If something isn't there, say you don't have it rather than inventing it. Never fabricate names, dates, or quotes.",
    "When suggesting matches, give a one-line rationale per person. Keep replies tight. No em-dashes.",
    "",
    "RELEVANT ROSTER (semantic search results):",
    rosterBlock || "(none retrieved)",
    "",
    "RELEVANT NOTES:",
    noteBlock || "(none matched)",
  ].join("\n");

  const res = await copilotReply(system, history);
  if (res.live) return res;
  // LLM unavailable (no key or unfunded): use the local intent engine, which
  // produces a real answer from the live roster rather than a stub.
  return { text: await localAnswer(history), live: false };
}
