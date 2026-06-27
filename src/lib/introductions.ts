// The operator-driven SMS introduction flow.
//
// Mental model: the matchmaker picks two people and sends each a "want an intro?"
// text. Each replies Y/N. When BOTH say yes, we connect them (text each the
// other's number) and the match moves to "connected". One "no" closes it.
//
// A Match in this flow moves: invited -> mutual_yes -> connected, or -> exit.
import { prisma } from "./prisma";
import { sendSMS, connectedSMS } from "./sms";

export type IntroDecision = "yes" | "pass";

type DecisionOutcome =
  | { ok: false; reason: "no_match" }
  | { ok: true; side: "a" | "b"; matchId: string; nowMutual: boolean; connected: boolean; otherName: string };

/** Record one person's Y/N reply to their pending introduction and, if both have
 *  now said yes, connect them. Returns what happened so the caller (SMS webhook
 *  or operator UI) can respond appropriately. */
export async function recordIntroDecision(personId: string, decision: IntroDecision): Promise<DecisionOutcome> {
  // The introduction this reply belongs to: the newest one still awaiting this
  // person's decision (invited or already-mutual-pending). A person is "A" or
  // "B" on the match; their pending decision tells us which reply we're filling.
  const match = await prisma.match.findFirst({
    where: {
      stage: { in: ["invited", "mutual_yes"] },
      OR: [
        { personAId: personId, aDecision: "pending" },
        { personBId: personId, bDecision: "pending" },
      ],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      personA: { select: { id: true, name: true, phone: true } },
      personB: { select: { id: true, name: true, phone: true } },
    },
  });

  if (!match) return { ok: false, reason: "no_match" };

  const side: "a" | "b" = match.personAId === personId ? "a" : "b";
  const otherPerson = side === "a" ? match.personB : match.personA;

  if (decision === "pass") {
    await prisma.match.update({
      where: { id: match.id },
      data: {
        [side === "a" ? "aDecision" : "bDecision"]: "pass",
        stage: "exit",
        exitReason: "declined_sms",
        lastActorId: personId,
      },
    });
    return { ok: true, side, matchId: match.id, nowMutual: false, connected: false, otherName: otherPerson.name };
  }

  const updated = await prisma.match.update({
    where: { id: match.id },
    data: {
      [side === "a" ? "aDecision" : "bDecision"]: "yes",
      lastActorId: personId,
    },
  });

  const nowMutual = updated.aDecision === "yes" && updated.bDecision === "yes";
  if (!nowMutual) {
    // First yes: park at mutual_yes-pending so we still know it's awaiting the other.
    await prisma.match.update({ where: { id: match.id }, data: { stage: "mutual_yes" } });
    return { ok: true, side, matchId: match.id, nowMutual: false, connected: false, otherName: otherPerson.name };
  }

  const connected = await connectMatch(match.id);
  return { ok: true, side, matchId: match.id, nowMutual: true, connected, otherName: otherPerson.name };
}

/** Both said yes: text each person the other's number and mark connected.
 *  Idempotent — re-running won't double-send once connectedAt is set. */
export async function connectMatch(matchId: string): Promise<boolean> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      personA: { select: { name: true, phone: true } },
      personB: { select: { name: true, phone: true } },
    },
  });
  if (!match) return false;
  if (match.connectedAt) return true; // already connected

  const a = match.personA;
  const b = match.personB;

  if (a.phone) {
    await sendSMS({ to: a.phone, body: connectedSMS({ toName: a.name, otherName: b.name, otherPhone: b.phone || "(no number on file)" }) });
  }
  if (b.phone) {
    await sendSMS({ to: b.phone, body: connectedSMS({ toName: b.name, otherName: a.name, otherPhone: a.phone || "(no number on file)" }) });
  }

  await prisma.match.update({
    where: { id: matchId },
    data: { stage: "connected", connectedAt: new Date() },
  });
  return true;
}
