// The operator-driven SMS introduction flow.
//
// Mental model: the matchmaker picks two people and sends each a "want an intro?"
// text. Each replies Y/N. When BOTH say yes, we connect them (text each the
// other's number) and the match moves to "connected". One "no" closes it.
//
// A Match in this flow moves: invited -> mutual_yes -> connected, or -> exit.
import { prisma } from "./prisma";
import { sendSMS, connectedSMS, createGroupConversation, groupIntroSMS } from "./sms";

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

/** Both said yes: connect them and mark connected. Idempotent — re-running
 *  won't double-send once connectedAt is set.
 *
 *  Preferred path: open a real 3-way group MMS thread (operator + both
 *  applicants) masked behind our single Twilio number, so they can talk in one
 *  place with the matchmaker present. If the operator has no cell on file, or
 *  the group-MMS call fails for any reason (e.g. Group MMS not enabled on the
 *  account, a non-+1 number, a carrier rejection), we fall back to brokering
 *  each side the other's number. Either way the match is marked connected and
 *  this function never throws. */
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

  // The operator who created the intro joins the group from their own cell.
  let operatorPhone: string | null = null;
  let operatorName = "your matchmaker";
  if (match.createdById) {
    const op = await prisma.person.findUnique({
      where: { id: match.createdById },
      select: { name: true, phone: true },
    });
    operatorPhone = op?.phone ?? null;
    if (op?.name) operatorName = op.name;
  }

  let grouped = false;
  if (operatorPhone && a.phone && b.phone) {
    try {
      const res = await createGroupConversation({
        participants: [operatorPhone, a.phone, b.phone],
        operatorAddress: process.env.TWILIO_FROM ?? null,
        body: groupIntroSMS({ operatorName, aName: a.name, bName: b.name }),
        friendlyName: `mc-intro-${matchId}`,
      });
      grouped = res.ok;
      if (!res.ok) {
        console.error(`[intro] group MMS failed for match ${matchId} (${res.reason}); falling back to broker`);
      }
    } catch (e) {
      console.error(`[intro] group MMS threw for match ${matchId}: ${(e as Error).message}; falling back to broker`);
    }
  }

  // Fallback (operator has no cell, or the group thread couldn't be created):
  // text each person the other's number, the original broker behavior.
  if (!grouped) {
    if (a.phone) {
      await sendSMS({ to: a.phone, body: connectedSMS({ toName: a.name, otherName: b.name, otherPhone: b.phone || "(no number on file)" }) });
    }
    if (b.phone) {
      await sendSMS({ to: b.phone, body: connectedSMS({ toName: b.name, otherName: a.name, otherPhone: a.phone || "(no number on file)" }) });
    }
  }

  await prisma.match.update({
    where: { id: matchId },
    data: { stage: "connected", connectedAt: new Date() },
  });
  return true;
}
