/**
 * Read-only send log. Answers "did that email actually go out?" from the
 * terminal, against whatever database DATABASE_URL points at.
 *
 *   npx tsx scripts/delivery-status.ts                  # 20 most recent
 *   npx tsx scripts/delivery-status.ts jess@gmail.com   # filter by recipient
 *   npx tsx scripts/delivery-status.ts --limit 50
 *   npx tsx scripts/delivery-status.ts --check          # ask Resend what landed
 *
 * A row is `sent` only after the provider accepted it and returned a message
 * id, which is the same id you can look up in the Resend or Twilio dashboard.
 * `--check` goes one step further and asks Resend for that message's last event
 * (delivered, bounced, complained), which needs RESEND_API_KEY in the env.
 */
import { PrismaClient } from "@prisma/client";
import { fetchEmailProviderStatus } from "../src/lib/email";

const prisma = new PrismaClient();

function subjectOf(payload: unknown): string {
  if (payload && typeof payload === "object" && "subject" in payload) {
    const subject = (payload as { subject?: unknown }).subject;
    if (typeof subject === "string") return subject;
  }
  return "";
}

async function main() {
  const args = process.argv.slice(2);
  const limitFlag = args.indexOf("--limit");
  const limit = limitFlag >= 0 ? Number(args[limitFlag + 1]) || 20 : 20;
  const query = args.filter((a, i) => !a.startsWith("--") && i !== limitFlag + 1)[0];
  const check = args.includes("--check");

  const jobs = await prisma.deliveryJob.findMany({
    where: query ? { recipient: { contains: query, mode: "insensitive" } } : {},
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      channel: true,
      kind: true,
      recipient: true,
      status: true,
      attempts: true,
      lastError: true,
      providerMessageId: true,
      createdAt: true,
      sentAt: true,
      payload: true,
    },
  });

  const counts = await prisma.deliveryJob.groupBy({ by: ["status"], _count: true });
  console.log(
    `Totals: ${counts.map((c) => `${c.status}=${c._count}`).join("  ") || "none"}\n`,
  );

  if (jobs.length === 0) {
    console.log(query ? `No delivery jobs for "${query}".` : "No delivery jobs.");
    return;
  }

  for (const job of jobs) {
    const when = (job.sentAt ?? job.createdAt).toISOString().replace("T", " ").slice(0, 16);
    console.log(
      `${job.status.toUpperCase().padEnd(10)} ${when}  ${job.channel.padEnd(5)} ${job.kind}`,
    );
    console.log(`  to        ${job.recipient}`);
    const subject = subjectOf(job.payload);
    if (subject) console.log(`  subject   ${subject}`);
    if (job.providerMessageId) console.log(`  providerId ${job.providerMessageId}`);
    if (job.lastError) console.log(`  error     ${job.lastError} (attempt ${job.attempts})`);
    if (check && job.channel === "email" && job.providerMessageId) {
      const status = await fetchEmailProviderStatus(job.providerMessageId);
      console.log(
        status.ok
          ? `  provider  ${status.lastEvent}${status.to.length ? ` to ${status.to.join(", ")}` : ""}`
          : `  provider  lookup failed: ${status.error}`,
      );
    }
    console.log("");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
