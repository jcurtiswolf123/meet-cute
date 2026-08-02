import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOperatorPage } from "@/lib/page-auth";
import { Avatar } from "@/components/ui";
import { manualMatch } from "@/lib/actions";

export const dynamic = "force-dynamic";

// Both pipelines the schema describes: the introduction flow
// (suggested -> invited -> mutual_yes -> connected) and the older dating path
// that continues past it. The board only listed the dating path, so every
// invited and connected match was missing from the page entirely, not just
// mislabelled.
const STAGES: [string, string][] = [
  ["suggested", "Suggested"],
  ["invited", "Invited"],
  ["mutual_yes", "Mutual yes"],
  ["connected", "Connected"],
  // "Date scheduled" was the only label that wrapped to two lines in the
  // summary strip, which made its cell taller than the other seven.
  ["date_scheduled", "Date set"],
  ["first_date", "First date"],
  ["second_date", "Second date"],
  ["relationship", "Together"],
];

const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGES);

// How long a match has sat at its current stage. The whole point of the page
// is to surface the stalled ones, and the old board showed no age at all.
function daysSince(when: Date): string {
  const days = Math.floor((Date.now() - when.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export default async function Pipeline() {
  await requireOperatorPage();
  const matches = await prisma.match.findMany({
    where: { stage: { not: "exit" } },
    include: {
      personA: { include: { photos: true } },
      personB: { include: { photos: true } },
      thread: { select: { state: true, confirmedSlot: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const members = await prisma.person.findMany({
    where: { status: "active", isOperator: false, isAmbassador: false, isCoach: false },
    select: { id: true, name: true, city: true },
    orderBy: { name: "asc" },
  });

  // Most stalled first, and anything waiting on the operator ahead of anything
  // waiting on the members, since only one of those is actionable from here.
  const rows = [...matches].sort((a, b) => {
    const aMine = a.thread?.state === "handoff" ? 0 : 1;
    const bMine = b.thread?.state === "handoff" ? 0 : 1;
    if (aMine !== bMine) return aMine - bMine;
    return a.updatedAt.getTime() - b.updatedAt.getTime();
  });

  return (
    <div>
      <h1 className="font-sans tracking-[-0.012em] text-2xl font-medium">Status</h1>
      <p className="mt-1 text-sm text-muted">Every match, from suggestion to relationship. Where it stalls is where you act.</p>

      {/* Operator override: manually match any two members */}
      <details className="card mt-5 p-4">
        <summary className="cursor-pointer text-sm font-medium">Create a match manually (override)</summary>
        <p className="mt-2 text-xs text-muted">
          Force a suggestion between any two active members, bypassing the candidate filter. Blocks
          and existing matches are still respected.
        </p>
        <form action={manualMatch} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Member A</span>
            <select name="personAId" required defaultValue="" className="field mt-1.5">
              <option value="" disabled>Choose a member</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name} ({m.city})</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Member B</span>
            <select name="personBId" required defaultValue="" className="field mt-1.5">
              <option value="" disabled>Choose a member</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name} ({m.city})</option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Why this match (optional)</span>
            <input name="rationale" placeholder="Your reasoning, shown to no one but the studio" className="field mt-1.5" />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary">Create suggestion</button>
          </div>
        </form>
      </details>

      {/* Shape of the pipeline at a glance. This is the one thing the old
          six-column board did well, so it stays, as a strip rather than as the
          page's whole structure. */}
      {/* Not the shared .ledger: that stacks to one cell per row below sm, and
          eight of them buried the table under 660px of summary on a phone. */}
      <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-lg border border-studio-line bg-studio-panel sm:grid-cols-4 lg:grid-cols-8">
        {STAGES.map(([key, label]) => (
          <div
            key={key}
            className="flex flex-col gap-1 border-b border-r border-studio-line px-4 py-3 last:border-r-0"
          >
            <div className="ledger-num">{matches.filter((m) => m.stage === key).length}</div>
            <div className="ledger-label">{label}</div>
          </div>
        ))}
      </div>

      {/* The board used to be six columns of cards. At six across each card was
          about 165px wide holding two avatars, both names twice, a city and a
          status, all at 11px, and the card was not the interaction: only two
          tiny name links inside it were. Nothing dragged. It was a status
          table drawn as a kanban, so it is a status table now, sorted by how
          long a match has sat still, because the page's own promise is that
          where it stalls is where you act. */}
      <h2 className="mt-8 font-sans tracking-[-0.012em] text-lg font-medium">
        Every open match
      </h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          No open matches. Suggest one from Matchmaking, or use the override above.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-studio-line bg-studio-panel">
          <table className="roster min-w-[720px]">
            <thead>
              <tr>
                <th>Pair</th>
                <th>City</th>
                <th>Stage</th>
                <th>Waiting on</th>
                <th className="text-right">Still here</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-2">
                        <Avatar url={m.personA.photos[0]?.url} name={m.personA.name} size={28} />
                        <Avatar url={m.personB.photos[0]?.url} name={m.personB.name} size={28} />
                      </div>
                      <span className="flex flex-wrap items-center gap-x-1.5">
                        <Link
                          href={`/studio/person/${m.personA.id}`}
                          className="font-medium text-ink hover:underline"
                        >
                          {m.personA.name.split(" ")[0]}
                        </Link>
                        <span className="text-muted">+</span>
                        <Link
                          href={`/studio/person/${m.personB.id}`}
                          className="font-medium text-ink hover:underline"
                        >
                          {m.personB.name.split(" ")[0]}
                        </Link>
                      </span>
                    </div>
                  </td>
                  <td className="text-muted">{m.personA.city}</td>
                  <td>{STAGE_LABEL[m.stage] ?? m.stage}</td>
                  <td>
                    {m.thread?.state === "handoff" ? (
                      <span className="font-medium text-claret">You</span>
                    ) : m.thread?.confirmedSlot ? (
                      <span className="text-muted">
                        Date set,{" "}
                        {m.thread.confirmedSlot.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    ) : (
                      <span className="text-muted">Them</span>
                    )}
                  </td>
                  <td className="text-right tabular-nums text-muted">{daysSince(m.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
