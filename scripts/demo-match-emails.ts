// Manual QA harness for the auto-email-on-match flow.
//
// It mirrors exactly what the Studio "Make a match" composer does when you send
// an introduction: create a Match, queue the double opt-in invite emails, then
// (when both say yes) queue the single joint connection email. Instead of hitting
// a live mail provider it drains the outbox with a capture sender and prints every
// email that would go out, so you can eyeball subjects, recipients, and bodies.
//
// Run against an ISOLATED LOCAL database only:
//   DATABASE_URL=postgresql://postgres@localhost:5433/meetcute_test?schema=meetcute \
//     node --import tsx scripts/demo-match-emails.ts
import assert from "node:assert/strict";
import type { DeliveryJob } from "@prisma/client";

const url = process.env.DATABASE_URL || "";
if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
  throw new Error("Refusing to run: DATABASE_URL is not a local database.");
}
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "demo-key";
process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://hellomutuals.com";

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { sendEmailInvites, recordInviteDecision } = await import("../src/lib/introductions");
  const { drainDeliveryJobs } = await import("../src/lib/delivery");

  const sent: { kind: string; to: string; subject: string; snippet: string }[] = [];
  const capture = async (job: DeliveryJob) => {
    const p = job.payload as Record<string, unknown>;
    sent.push({
      kind: job.kind,
      to: Array.isArray(p.to) ? (p.to as string[]).join(", ") : String(p.to),
      subject: String(p.subject ?? ""),
      snippet: String(p.text ?? "").replace(/\s+/g, " ").slice(0, 90),
    });
    return { ok: true as const, providerMessageId: `demo-${sent.length}` };
  };

  // Two active roster members who never toggled the member-app opt-in. Before the
  // change this pair could not be introduced at all.
  const a = await prisma.person.findFirstOrThrow({ where: { name: { startsWith: "Maya Rosen" } } });
  const b = await prisma.person.findFirstOrThrow({ where: { name: { startsWith: "Alex Chen" } } });
  console.log(`Matching ${a.name} <${a.email}>  x  ${b.name} <${b.email}>`);
  console.log(`openToMatch: ${a.name}=${a.openToMatch}, ${b.name}=${b.openToMatch} (operator intro does not require it)\n`);

  const match = await prisma.match.create({
    data: { personAId: a.id, personBId: b.id, stage: "invited" },
  });

  // 1) The moment the match is made: one double opt-in invite email per person.
  const queued = await sendEmailInvites(match.id, { throwOnError: true });
  console.log(`STEP 1 - invites queued after the match: ${queued}`);
  await drainDeliveryJobs({ matchId: match.id, limit: 10, send: capture });

  // 2) Both reply Y (here via their invite tokens, same path as the email buttons
  //    and the inbound reply webhook). A mutual yes connects them.
  const invites = await prisma.matchInvite.findMany({ where: { matchId: match.id } });
  for (const inv of invites) await recordInviteDecision(inv.token, "yes");
  const state = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
  console.log(`\nSTEP 2 - both said yes -> match stage is now "${state.stage}"`);
  await drainDeliveryJobs({ matchId: match.id, limit: 10, send: capture });
  const final = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
  console.log(`STEP 3 - after the connection email sends -> stage "${final.stage}", connectedAt=${!!final.connectedAt}\n`);

  console.log("Emails that went out (captured, not really sent):");
  for (const e of sent) {
    console.log(`  - [${e.kind}] to ${e.to}\n      subject: ${e.subject}\n      body:    ${e.snippet}...`);
  }

  // Sanity: exactly two invite emails, then exactly one joint connection thread.
  assert.equal(sent.filter((e) => e.kind.startsWith("intro_invite_")).length, 2);
  assert.equal(sent.filter((e) => e.kind === "connection_email_thread").length, 1);
  assert.equal(final.stage, "connected");
  console.log("\nOK: 2 invite emails + 1 joint connection email, match connected.");

  await prisma.matchInvite.deleteMany({ where: { matchId: match.id } });
  await prisma.deliveryJob.deleteMany({ where: { matchId: match.id } });
  await prisma.introMessage.deleteMany({ where: { matchId: match.id } });
  await prisma.match.delete({ where: { id: match.id } });
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
