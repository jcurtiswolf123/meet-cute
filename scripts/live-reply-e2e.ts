// Live end-to-end check of the reply-by-email match path, against production.
//
// Everything else in the suite stubs the mail provider. This one does not. It is
// the only check that exercises the parts no local test can reach:
//
//   Resend outbound  ->  a real inbox  ->  a real reply  ->  the inbound MX  ->
//   the Resend receiving webhook  ->  the prod signature check  ->  the parser
//   ->  the decision write  ->  the joint connection email.
//
// DNS, the webhook secret, the receiving-API fetch, and what real mail clients
// actually put on the wire are all only covered here.
//
// It creates two disposable people whose addresses are plus-aliases of the
// operator's own mailbox, so no real member is ever contacted, and it deletes
// them in a finally block.
//
//   MUTUALS_LIVE_E2E=i-understand-this-writes-to-production \
//     node --env-file=.env --import tsx scripts/live-reply-e2e.ts setup
//   ... reply to the two invites, or use `scripts/live-reply-send.sh` ...
//   MUTUALS_LIVE_E2E=... node --env-file=.env --import tsx scripts/live-reply-e2e.ts check
//   MUTUALS_LIVE_E2E=... node --env-file=.env --import tsx scripts/live-reply-e2e.ts cleanup
import { PrismaClient } from "@prisma/client";

const GUARD = "i-understand-this-writes-to-production";
if (process.env.MUTUALS_LIVE_E2E !== GUARD) {
  throw new Error(
    `Refusing to run. This writes to whatever DATABASE_URL points at. Set MUTUALS_LIVE_E2E=${GUARD}.`,
  );
}

const MAILBOX = process.env.LIVE_E2E_MAILBOX || "josh@shiftsupportnetwork.com";
const [localPart, mailDomain] = MAILBOX.split("@");
const TAG = "mcqa";
const NAME_PREFIX = "ZZ QA Do Not Contact";

const prisma = new PrismaClient();

/** Where the two invites go.
 *
 *  The default is two plus-aliases of one operator mailbox, which is enough to
 *  exercise the decision path and needs no extra accounts. Set LIVE_E2E_TO to a
 *  comma-separated pair to use genuinely separate inboxes instead, which is the
 *  only way to see how a given provider renders and files the message:
 *
 *    LIVE_E2E_TO="you@gmail.com,you@outlook.com"
 *
 *  Both addresses must be ones you control. This sends real mail. */
function recipients(): [string, string] {
  const configured = (process.env.LIVE_E2E_TO || "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  if (!configured.length) {
    return [`${localPart}+${TAG}-a@${mailDomain}`, `${localPart}+${TAG}-b@${mailDomain}`];
  }
  if (configured.length !== 2) {
    throw new Error(`LIVE_E2E_TO needs exactly two addresses, got ${configured.length}`);
  }
  return [configured[0], configured[1]];
}

async function setup() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const to = recipients();
  console.log(`sending to ${to[0]} and ${to[1]}`);
  const people = await Promise.all(
    (["a", "b"] as const).map((side, index) =>
      prisma.person.create({
        data: {
          name: `${NAME_PREFIX} ${side.toUpperCase()} ${stamp}`,
          email: to[index],
          city: "New York",
          headline: "Automated reply-path check. Not a member.",
          status: "active",
          openToMatch: true,
          appliedAt: new Date(),
          agreedTosAt: new Date(),
        },
      }),
    ),
  );

  const match = await prisma.match.create({
    data: { personAId: people[0].id, personBId: people[1].id, stage: "invited" },
  });

  const { sendEmailInvites } = await import("../src/lib/introductions");
  const { drainDeliveryJobs } = await import("../src/lib/delivery");
  const queued = await sendEmailInvites(match.id, { throwOnError: true });
  const drained = await drainDeliveryJobs({ matchId: match.id, limit: 10 });

  const invites = await prisma.matchInvite.findMany({
    where: { matchId: match.id },
    select: { personId: true, token: true, sentAt: true },
  });
  const inboundDomain = (process.env.RESEND_INBOUND_DOMAIN || "").split(",")[0]?.trim();

  console.log(JSON.stringify({ matchId: match.id, queued, drained }, null, 2));
  for (const invite of invites) {
    const side = invite.personId === people[0].id ? "A" : "B";
    console.log(
      `${side} reply-to: r+${invite.token}@${inboundDomain}  sent=${Boolean(invite.sentAt)}`,
    );
  }
}

async function check() {
  const match = await prisma.match.findFirstOrThrow({
    where: { personA: { name: { startsWith: NAME_PREFIX } } },
    orderBy: { createdAt: "desc" },
    include: {
      personA: { select: { name: true, email: true } },
      personB: { select: { name: true, email: true } },
      invites: { select: { personId: true, sentAt: true, decidedAt: true } },
    },
  });
  const jobs = await prisma.deliveryJob.findMany({
    where: { matchId: match.id },
    select: { kind: true, status: true, attempts: true, lastError: true, sentAt: true },
  });
  console.log(
    JSON.stringify(
      {
        matchId: match.id,
        stage: match.stage,
        aDecision: match.aDecision,
        bDecision: match.bDecision,
        connectedAt: match.connectedAt,
        invites: match.invites.map((i) => ({ sent: Boolean(i.sentAt), decidedAt: i.decidedAt })),
        jobs,
      },
      null,
      2,
    ),
  );
}

async function cleanup() {
  const people = await prisma.person.findMany({
    where: { name: { startsWith: NAME_PREFIX } },
    select: { id: true, name: true },
  });
  if (!people.length) {
    console.log("nothing to clean up");
    return;
  }
  const ids = people.map((p) => p.id);
  const matches = await prisma.match.findMany({
    where: { OR: [{ personAId: { in: ids } }, { personBId: { in: ids } }] },
    select: { id: true },
  });
  const matchIds = matches.map((m) => m.id);
  if (matchIds.length) {
    await prisma.matchInvite.deleteMany({ where: { matchId: { in: matchIds } } });
    await prisma.deliveryJob.deleteMany({ where: { matchId: { in: matchIds } } });
    await prisma.introMessage.deleteMany({ where: { matchId: { in: matchIds } } });
    await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
  }
  await prisma.deliveryJob.deleteMany({ where: { personId: { in: ids } } });
  await prisma.person.deleteMany({ where: { id: { in: ids } } });
  console.log(`removed ${people.length} test people and ${matchIds.length} matches`);
}

const command = process.argv[2] || "check";
const commands: Record<string, () => Promise<void>> = { setup, check, cleanup };
const run = commands[command];
if (!run) throw new Error(`unknown command "${command}" (setup | check | cleanup)`);

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
