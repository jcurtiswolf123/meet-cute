// Nudge friends who were asked before the automatic reminders existed.
//
// The three nudges (two, five, ten days) are queued at the moment the ask goes
// out, so they only exist for requests created after that shipped. The friends
// asked before it have no scheduled nudge at all and would simply never hear
// from us again, which is the worst of both worlds: we took their address and
// then did nothing with it.
//
// Two things make this different from a normal nudge, and both are the reason
// this is a script someone runs rather than a job that fires:
//
//   1. It emails people who never contacted Mutuals. That decision is not the
//      code's to make, so nothing sends without --send.
//   2. Every one of these applicants was approved by an operator before their
//      friends wrote. "They are not accepted until two friends write back" is
//      now false for them, and sending it would be a lie to the exact people
//      whose goodwill this whole loop depends on. The email says the true
//      thing instead: you are not blocking anyone, and your words are what
//      their match will read.
//
// Usage:
//   node --import tsx scripts/nudge-outstanding-recommenders.ts            # dry run
//   node --import tsx scripts/nudge-outstanding-recommenders.ts --send     # queue them

import { prisma } from "../src/lib/prisma";
import { recommendationRequestEmail } from "../src/lib/email";
import { makeDeliveryKey, queueEmailDelivery } from "../src/lib/delivery";
import { recommendationReplyTo, recommendationUrl } from "../src/lib/recommendations";

const send = process.argv.includes("--send");

async function main() {
  const host = new URL(process.env.DATABASE_URL!).hostname;
  console.log(`target: ${host}`);
  console.log(send ? "MODE: sending" : "MODE: dry run (pass --send to queue)");

  const outstanding = await prisma.recommendation.findMany({
    where: { status: "requested", requestedAt: { not: null } },
    include: {
      applicant: { select: { name: true, city: true, status: true, email: true } },
    },
    orderBy: { requestedAt: "asc" },
  });

  if (outstanding.length === 0) {
    console.log("nothing outstanding");
    return;
  }

  let queued = 0;
  let skipped = 0;
  for (const request of outstanding) {
    // A request whose applicant walked away is not nudged. Asking someone to
    // vouch for a person who is no longer applying wastes the one message we
    // get with them.
    if (request.applicant.status === "exited") {
      console.log(`skip  ${request.email} (applicant declined)`);
      skipped += 1;
      continue;
    }

    // Already covered by the automatic schedule: leave it alone rather than
    // stacking a second nudge on top of one that is already due.
    const scheduled = await prisma.deliveryJob.count({
      where: { kind: "recommendation_reminder", recipient: request.email, status: "pending" },
    });
    if (scheduled > 0) {
      console.log(`skip  ${request.email} (${scheduled} nudge(s) already scheduled)`);
      skipped += 1;
      continue;
    }

    const accepted = request.applicant.status === "active";
    const msg = recommendationRequestEmail({
      recommenderName: request.name,
      applicantName: request.applicant.name,
      applicantCity: request.applicant.city,
      link: recommendationUrl(request.token),
      reminder: true,
      applicantNote: request.applicantNote,
      replyToVouch: !!recommendationReplyTo(request.token),
      applicantAccepted: accepted,
    });

    console.log(
      `${send ? "queue" : "would"} ${request.email.padEnd(32)} for ${request.applicant.name.padEnd(20)} ${accepted ? "(already a member)" : "(still waiting)"}`,
    );
    if (!send) {
      queued += 1;
      continue;
    }

    await queueEmailDelivery({
      kind: "recommendation_reminder",
      to: request.email,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      replyTo: recommendationReplyTo(request.token),
      // Keyed to the token and this backfill, so running the script twice
      // cannot send the same person the same nudge twice.
      idempotencyKey: makeDeliveryKey("recommendation_reminder", request.token, "backfill"),
    });
    await prisma.recommendation.update({
      where: { id: request.id },
      data: { remindedAt: new Date() },
    });
    queued += 1;
  }

  console.log(`\n${send ? "queued" : "would queue"}: ${queued}, skipped: ${skipped}`);
  if (!send) console.log("nothing was sent. re-run with --send");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
