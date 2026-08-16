import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Avatar } from "@/components/ui";
import { manualMatch } from "@/lib/actions";
import { Select } from "@/components/select";

// Was `/studio/pipeline`, labelled "Status" in the rail. Every open match with
// its stage and how long it has sat there, plus the operator override that can
// force a suggestion between any two members.
//
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

/** Exactly what a board row draws of each half of a match. */
const MATCH_PERSON_CARD = {
  id: true,
  name: true,
  city: true,
  photos: {
    where: { status: { not: "rejected" } },
    orderBy: { order: "asc" },
    take: 1,
    select: { url: true },
  },
} as const;

// How long a match has sat at its current stage. The whole point of the view is
// to surface the stalled ones, and the old board showed no age at all.
function daysSince(when: Date): string {
  const days = Math.floor((Date.now() - when.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export async function openMatchCount(): Promise<number> {
  return prisma.match.count({ where: { stage: { not: "exit" } } });
}

export async function BoardView() {
  // The board and the override picker do not depend on each other, so they are
  // issued together rather than one after the other, and each relation rides
  // along on a join instead of costing its own trip to us-east-2.
  const [matches, members] = await Promise.all([
    prisma.match.findMany({
      where: { stage: { not: "exit" } },
      relationLoadStrategy: "join",
      include: {
        personA: { select: MATCH_PERSON_CARD },
        personB: { select: MATCH_PERSON_CARD },
        thread: { select: { state: true, confirmedSlot: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.person.findMany({
      where: { status: "active", isOperator: false, isAmbassador: false, isCoach: false },
      select: { id: true, name: true, city: true },
      orderBy: { name: "asc" },
    }),
  ]);

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
      {/* Shape of the pipeline at a glance. Not the shared .ledger: eight cells
          of it is a different rhythm from the two and three the other views
          state, and this one is a matrix rather than a strip. */}
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-studio-line bg-studio-panel sm:grid-cols-4 lg:grid-cols-8">
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

      {/* Operator override: manually match any two members. Below the numbers,
          because reading the board is what this view is for and forcing a
          suggestion is the exception. */}
      <details className="card mt-6 p-4">
        <summary className="cursor-pointer text-sm font-medium">Create a match manually (override)</summary>
        <p className="mt-2 text-xs text-muted">
          Force a suggestion between any two active members, bypassing the candidate filter. Blocks
          and existing matches are still respected.
        </p>
        <form action={manualMatch} className="mt-3 grid gap-3 sm:grid-cols-2">
          <Select
            name="personAId"
            label="Member A"
            showLabel
            placeholder="Choose a member"
            options={members.map((m) => ({ value: m.id, label: m.name, hint: m.city }))}
          />
          <Select
            name="personBId"
            label="Member B"
            showLabel
            placeholder="Choose a member"
            options={members.map((m) => ({ value: m.id, label: m.name, hint: m.city }))}
          />
          <label className="block sm:col-span-2">
            <span className="label">Why this match (optional)</span>
            <input name="rationale" placeholder="Your reasoning, shown to no one but the studio" className="field mt-1.5" />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary">Create suggestion</button>
          </div>
        </form>
      </details>

      {/* The board used to be six columns of cards. At six across each card was
          about 165px wide holding two avatars, both names twice, a city and a
          status, all at 11px, and the card was not the interaction: only two
          tiny name links inside it were. Nothing dragged. It was a status table
          drawn as a kanban, so it is a status table now, sorted by how long a
          match has sat still, because the view's own promise is that where it
          stalls is where you act. */}
      <h2 className="mt-8 font-sans tracking-[-0.012em] text-lg font-medium">Every open match</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          No open matches. Suggest one from Matchmaking, or use the override above.
        </p>
      ) : (
        <>
          {/* Phones get rows, not a table. Five columns at 720px inside a 390px
              screen scrolled sideways with nothing to say it could. */}
          <ul className="mt-3 space-y-2 md:hidden">
            {rows.map((m) => (
              <li key={m.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <span className="flex shrink-0 -space-x-2">
                    <Avatar url={m.personA.photos[0]?.url} name={m.personA.name} size={30} />
                    <Avatar url={m.personB.photos[0]?.url} name={m.personB.name} size={30} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-1.5 text-sm font-medium text-ink">
                      <Link href={`/studio/person/${m.personA.id}`} className="hover:underline">
                        {m.personA.name}
                      </Link>
                      <span className="text-muted">+</span>
                      <Link href={`/studio/person/${m.personB.id}`} className="hover:underline">
                        {m.personB.name}
                      </Link>
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {m.personA.city} · {STAGE_LABEL[m.stage] ?? m.stage} · {daysSince(m.updatedAt)} at
                      this stage
                    </p>
                    <p className="mt-1 text-xs">
                      <span className="text-muted">Waiting on </span>
                      <WaitingOn thread={m.thread} />
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-3 hidden overflow-x-auto rounded-lg border border-studio-line bg-studio-panel md:block">
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
                            {m.personA.name}
                          </Link>
                          <span className="text-muted">+</span>
                          <Link
                            href={`/studio/person/${m.personB.id}`}
                            className="font-medium text-ink hover:underline"
                          >
                            {m.personB.name}
                          </Link>
                        </span>
                      </div>
                    </td>
                    <td className="text-muted">{m.personA.city}</td>
                    <td>{STAGE_LABEL[m.stage] ?? m.stage}</td>
                    <td>
                      <WaitingOn thread={m.thread} />
                    </td>
                    <td className="text-right tabular-nums text-muted">{daysSince(m.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function WaitingOn({ thread }: { thread: { state: string; confirmedSlot: Date | null } | null }) {
  if (thread?.state === "handoff") return <span className="font-medium text-claret">You</span>;
  if (thread?.confirmedSlot) {
    return (
      <span className="text-muted">
        Date set, {thread.confirmedSlot.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </span>
    );
  }
  return <span className="text-muted">Them</span>;
}
