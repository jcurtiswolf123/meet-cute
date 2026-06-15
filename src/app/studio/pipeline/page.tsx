import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Avatar } from "@/components/ui";

export const dynamic = "force-dynamic";

const STAGES: [string, string][] = [
  ["suggested", "Suggested"],
  ["mutual_yes", "Mutual yes"],
  ["date_scheduled", "Date scheduled"],
  ["first_date", "First date"],
  ["second_date", "Second date"],
  ["relationship", "Together"],
];

export default async function Pipeline() {
  const matches = await prisma.match.findMany({
    where: { stage: { not: "exit" } },
    include: {
      personA: { include: { photos: true } },
      personB: { include: { photos: true } },
      thread: { select: { state: true, confirmedSlot: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <h1 className="font-display text-2xl font-medium">Match pipeline</h1>
      <p className="mt-1 text-sm text-muted">Every match, from suggestion to relationship. Where it stalls is where you act.</p>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {STAGES.map(([key, label]) => {
          const col = matches.filter((m) => m.stage === key);
          return (
            <div key={key} className="rounded-xl2 bg-paper/50 p-2">
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
                <span className="text-xs text-muted">{col.length}</span>
              </div>
              <div className="space-y-2">
                {col.map((m) => (
                  <div key={m.id} className="card p-3">
                    <div className="flex -space-x-2">
                      <Avatar url={m.personA.photos[0]?.url} name={m.personA.name} size={28} />
                      <Avatar url={m.personB.photos[0]?.url} name={m.personB.name} size={28} />
                    </div>
                    <div className="mt-2 text-xs font-medium leading-tight">
                      {m.personA.name.split(" ")[0]} + {m.personB.name.split(" ")[0]}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted">{m.personA.city}</div>
                    {m.thread?.state === "handoff" && (
                      <div className="mt-1 text-[11px] font-medium text-claret">needs you</div>
                    )}
                    {m.thread?.confirmedSlot && (
                      <div className="mt-1 text-[11px] text-sage">
                        {m.thread.confirmedSlot.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </div>
                    )}
                    <div className="mt-2 flex gap-2">
                      <Link href={`/studio/person/${m.personA.id}`} className="text-[11px] text-claret hover:underline">{m.personA.name.split(" ")[0]}</Link>
                      <Link href={`/studio/person/${m.personB.id}`} className="text-[11px] text-claret hover:underline">{m.personB.name.split(" ")[0]}</Link>
                    </div>
                  </div>
                ))}
                {!col.length && <div className="px-2 py-3 text-[11px] text-muted">empty</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
