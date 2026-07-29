import Link from "next/link";
import { requireOperatorPage } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { retryDeliveryJob } from "@/lib/actions";
import { fetchEmailProviderStatus } from "@/lib/email";

export const dynamic = "force-dynamic";

// The send log. Every email and text the platform queues lands here with the
// state the provider actually returned, so "did that email go out?" is a
// question with an evidence-backed answer instead of a guess. A row is only
// `sent` after the provider accepted it and gave back a message id.

const FILTERS = [
  { key: "all", label: "All" },
  { key: "sent", label: "Sent" },
  { key: "pending", label: "Queued" },
  { key: "failed", label: "Failed" },
  { key: "cancelled", label: "Cancelled" },
] as const;

const STATUS_TONE: Record<string, string> = {
  sent: "border-sage/30 bg-[#f5f5f6] text-ink",
  pending: "border-[#e3e3e6] bg-[#fafafa] text-ink",
  processing: "border-[#e3e3e6] bg-[#fafafa] text-ink",
  failed: "border-[#e3e3e6] bg-[#fafafa] text-ink",
  cancelled: "border-line bg-[#fafafa] text-muted",
};

function humanizeKind(kind: string): string {
  return kind.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// Pinned to New York. These pages render on the server, whose clock is UTC in
// production, so an unpinned timestamp told a New York operator that a 6:38 PM
// send happened at 2:38 AM.
function stamp(date: Date | null): string {
  if (!date) return "-";
  return date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function subjectOf(payload: unknown): string | null {
  if (payload && typeof payload === "object" && "subject" in payload) {
    const subject = (payload as { subject?: unknown }).subject;
    if (typeof subject === "string") return subject;
  }
  return null;
}

export default async function DeliveryLog({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; check?: string }>;
}) {
  await requireOperatorPage();
  const sp = await searchParams;
  const status = FILTERS.some((f) => f.key === sp.status) ? sp.status! : "all";
  const q = (sp.q ?? "").trim();
  const checkId = (sp.check ?? "").trim();

  const [counts, jobs] = await Promise.all([
    prisma.deliveryJob.groupBy({ by: ["status"], _count: true }),
    prisma.deliveryJob.findMany({
      where: {
        ...(status === "all" ? {} : status === "pending" ? { status: { in: ["pending", "processing"] } } : { status }),
        ...(q ? { recipient: { contains: q, mode: "insensitive" as const } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        channel: true,
        kind: true,
        recipient: true,
        status: true,
        attempts: true,
        maxAttempts: true,
        lastError: true,
        providerMessageId: true,
        createdAt: true,
        sentAt: true,
        payload: true,
        matchId: true,
        person: { select: { id: true, name: true } },
      },
    }),
  ]);

  const count = (key: string) => counts.find((c) => c.status === key)?._count ?? 0;
  const queued = count("pending") + count("processing");

  // Ask the provider what happened to one specific message. Accepted is not the
  // same as delivered, so this is the difference between "we handed it over" and
  // "it landed". Only runs for the row the operator clicked.
  const checkJob = checkId ? jobs.find((j) => j.id === checkId) : undefined;
  const checked =
    checkJob?.channel === "email" && checkJob.providerMessageId
      ? await fetchEmailProviderStatus(checkJob.providerMessageId)
      : null;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-sans tracking-[-0.012em] text-2xl font-medium">Delivery</h1>
          <p className="mt-1 text-sm text-muted">
            Every message the platform queued, and whether the provider accepted it. A row reads
            Sent only once the provider returned a message id.
          </p>
        </div>
        <div className="ledger">
          <div className="ledger-cell bg-[#f5f5f6]">
            <div className="ledger-num text-ink">{count("sent")}</div>
            <div className="ledger-label">Sent</div>
          </div>
          <div className="ledger-cell">
            <div className="ledger-num">{queued}</div>
            <div className="ledger-label">Queued</div>
          </div>
          <div className="ledger-cell">
            <div className="ledger-num">{count("failed")}</div>
            <div className="ledger-label">Failed</div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/studio/delivery" : `/studio/delivery?status=${f.key}`}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              status === f.key ? "border-ink bg-ink text-white" : "border-line text-muted hover:border-[#e3e3e6]"
            }`}
          >
            {f.label}
          </Link>
        ))}
        <form action="/studio/delivery" className="ml-auto flex items-center gap-2">
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          <input
            name="q"
            defaultValue={q}
            aria-label="Search by recipient"
            placeholder="Search recipient..."
            className="field max-w-[16rem]"
          />
          <button className="btn-ghost">Search</button>
        </form>
      </div>

      {jobs.length === 0 ? (
        <div className="card mt-6 p-10 text-center">
          <p className="text-sm text-muted">Nothing queued under this filter.</p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-line/70 overflow-hidden rounded-lg border border-line bg-panel">
          {jobs.map((job) => {
            const subject = subjectOf(job.payload);
            return (
              <li key={job.id} className="flex flex-wrap items-start justify-between gap-4 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {humanizeKind(job.kind)}{" "}
                    <span className="font-normal text-muted">via {job.channel} to {job.recipient}</span>
                  </p>
                  {subject && <p className="mt-0.5 truncate text-xs text-muted">Subject: {subject}</p>}
                  <p className="mt-0.5 text-xs text-muted">
                    Queued {stamp(job.createdAt)}
                    {job.sentAt ? ` · Sent ${stamp(job.sentAt)}` : ""}
                    {job.attempts ? ` · Attempt ${job.attempts} of ${job.maxAttempts}` : ""}
                  </p>
                  {job.providerMessageId && (
                    <p className="mt-0.5 font-mono text-[11px] text-muted">
                      Provider id {job.providerMessageId}
                    </p>
                  )}
                  {job.lastError && <p className="mt-0.5 text-xs text-ink">{job.lastError}</p>}
                  {checked && checkJob?.id === job.id && (
                    <p
                      role="status"
                      className={`mt-1.5 rounded-lg border px-3 py-1.5 text-xs ${
                        checked.ok && checked.lastEvent === "delivered"
                          ? "border-sage/30 bg-[#f5f5f6] text-ink"
                          : "border-[#e3e3e6] bg-[#fafafa] text-ink"
                      }`}
                    >
                      {checked.ok
                        ? `Provider says: ${checked.lastEvent}${checked.to.length ? ` to ${checked.to.join(", ")}` : ""}.`
                        : `Could not reach the provider: ${checked.error}`}
                    </p>
                  )}
                  <p className="mt-1 flex flex-wrap gap-3 text-xs">
                    {job.person && (
                      <Link href={`/studio/person/${job.person.id}`} className="text-ink hover:underline">
                        {job.person.name}
                      </Link>
                    )}
                    {job.matchId && (
                      <Link href={`/studio/conversations/${job.matchId}`} className="text-ink hover:underline">
                        Open thread
                      </Link>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                      STATUS_TONE[job.status] ?? "border-line bg-[#fafafa] text-muted"
                    }`}
                  >
                    {job.status === "processing" ? "Sending" : job.status.replace(/^\w/, (c) => c.toUpperCase())}
                  </span>
                  {job.channel === "email" && job.providerMessageId && (
                    <Link
                      href={{
                        pathname: "/studio/delivery",
                        query: {
                          ...(status === "all" ? {} : { status }),
                          ...(q ? { q } : {}),
                          check: job.id,
                        },
                      }}
                      className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-[#e3e3e6] hover:text-ink"
                    >
                      Check provider
                    </Link>
                  )}
                  {job.status === "failed" && (
                    <form action={retryDeliveryJob}>
                      <input type="hidden" name="deliveryJobId" value={job.id} />
                      <button className="rounded-full border border-[#e3e3e6] px-3 py-1 text-xs text-ink">
                        Retry
                      </button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 text-xs text-muted">
        Showing the 100 most recent, in New York time. Sent rows are kept for 30 days, failures for
        90.
      </p>
    </div>
  );
}
