import Link from "next/link";
import { requireOperatorPage } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Avatar } from "@/components/ui";

export const dynamic = "force-dynamic";

// Operator "people I've matched" history: every introduction ever made, grouped
// by where it landed. This is the read-only ledger that complements the
// make-a-match composer on the Directory and the live Conversations view.

const GROUPS = [
  { key: "connected", label: "Connected", stages: ["connected"] },
  { key: "active", label: "In progress", stages: ["invited", "mutual_yes", "connecting", "suggested"] },
  { key: "closed", label: "Closed", stages: ["exit"] },
] as const;

const STAGE_LABEL: Record<string, string> = {
  connected: "Connected",
  invited: "Invited",
  mutual_yes: "Mutual yes",
  connecting: "Connecting",
  suggested: "Suggested",
  exit: "Closed",
};

function toneFor(stage: string): string {
  if (stage === "connected") return "border-ink/25 bg-studio-canvas text-ink";
  if (stage === "exit") return "border-line bg-studio-subtle text-muted";
  return "border-studio-line bg-studio-subtle text-ink";
}

// Pinned to New York: the server clock is UTC in production, so an evening
// introduction rendered as the next day's date.
function fmt(date: Date): string {
  return date.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function MatchesHistory() {
  await requireOperatorPage();

  const matches = await prisma.match.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      personA: { select: { id: true, name: true, city: true, photos: { take: 1, orderBy: { order: "asc" } } } },
      personB: { select: { id: true, name: true, city: true, photos: { take: 1, orderBy: { order: "asc" } } } },
    },
  });

  const connectedCount = matches.filter((m) => m.stage === "connected").length;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-sans tracking-[-0.012em] text-3xl font-medium tracking-tight">Matches</h1>
          <p className="mt-1 text-sm text-muted">
            Everyone you have introduced, past and present.
          </p>
        </div>
        <div className="ledger">
          <div className="ledger-cell ledger-cell-lead">
            <span className="ledger-num">{matches.length}</span>
            <span className="ledger-label">Total intros</span>
          </div>
          <div className="ledger-cell">
            <span className="ledger-num">{connectedCount}</span>
            <span className="ledger-label">Connected</span>
          </div>
        </div>
      </div>

      {matches.length === 0 ? (
        <div className="card mt-8 p-10 text-center">
          <p className="text-sm text-muted">
            No introductions yet. Make your first match from the{" "}
            <Link href="/studio" className="text-ink underline">
              Directory
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          {GROUPS.map((group) => {
            const rows = matches.filter((m) => (group.stages as readonly string[]).includes(m.stage));
            if (rows.length === 0) return null;
            return (
              <section key={group.key}>
                <h2 className="public-label text-muted">
                  {group.label} · {rows.length}
                </h2>
                <ul className="mt-4 divide-y divide-line/70 overflow-hidden rounded-lg border border-line bg-panel">
                  {/* Each name links to that person's profile; the thread link
                      opens the introduction itself. Kept as sibling links rather
                      than one row-wide link so the profiles are reachable. */}
                  {rows.map((m) => (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-studio-canvas/70"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex -space-x-2">
                          <Avatar url={m.personA.photos[0]?.url} name={m.personA.name} size={34} />
                          <Avatar url={m.personB.photos[0]?.url} name={m.personB.name} size={34} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">
                            <Link href={`/studio/person/${m.personA.id}`} className="hover:text-ink hover:underline">
                              {m.personA.name}
                            </Link>
                            <span className="text-muted"> &amp; </span>
                            <Link href={`/studio/person/${m.personB.id}`} className="hover:text-ink hover:underline">
                              {m.personB.name}
                            </Link>
                          </p>
                          <p className="truncate text-xs text-muted">
                            {m.personA.city || m.personB.city || "No city"} ·{" "}
                            {m.connectedAt ? `Connected ${fmt(m.connectedAt)}` : `Started ${fmt(m.createdAt)}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${toneFor(m.stage)}`}
                        >
                          {STAGE_LABEL[m.stage] ?? m.stage}
                        </span>
                        <Link
                          href={`/studio/conversations/${m.id}`}
                          className="text-xs text-ink hover:underline"
                        >
                          Open thread
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
