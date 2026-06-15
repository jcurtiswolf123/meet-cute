import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { addNote, createSuggestion } from "@/lib/actions";
import { candidatesFor } from "@/lib/copilot";
import { connectionsOf, vouchesFor } from "@/lib/social";
import { Avatar, StageBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.person.findUnique({
    where: { id },
    include: {
      photos: true,
      prompts: true,
      referredBy: { select: { id: true, name: true } },
      matchesAsA: { include: { personB: { select: { id: true, name: true } } } },
      matchesAsB: { include: { personA: { select: { id: true, name: true } } } },
      dinnerAttendance: { include: { dinner: true } },
      coachingAsClient: { include: { coach: { select: { name: true } } } },
    },
  });
  if (!p) notFound();

  const [notes, vouches, connIds, candidates] = await Promise.all([
    prisma.note.findMany({ where: { subjectId: id }, orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } }),
    vouchesFor(id),
    connectionsOf(id),
    p.isOperator ? Promise.resolve([]) : candidatesFor(id, 4),
  ]);
  const connections = await prisma.person.findMany({ where: { id: { in: [...connIds] } }, select: { id: true, name: true } });

  const matches = [
    ...p.matchesAsA.map((m) => ({ id: m.id, other: m.personB, stage: m.stage })),
    ...p.matchesAsB.map((m) => ({ id: m.id, other: m.personA, stage: m.stage })),
  ];

  async function saveNote(formData: FormData) {
    "use server";
    const body = String(formData.get("body") ?? "").trim();
    if (body) await addNote(id, body, String(formData.get("kind") ?? "general"));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div>
        <Link href="/studio" className="text-xs text-muted hover:text-ink">&larr; Roster</Link>
        <div className="mt-3 flex items-start gap-4">
          <Avatar url={p.photos[0]?.url} name={p.name} size={72} />
          <div>
            <h1 className="font-display text-3xl font-medium">{p.name}{p.age ? `, ${p.age}` : ""}</h1>
            <p className="text-sm text-muted">{p.city} · {p.neighborhood} · {p.gender ? `${p.gender}, seeking ${p.seeking}` : "operator"}</p>
            <p className="mt-1 text-sm text-claret">{p.headline}</p>
          </div>
        </div>

        {p.bio && <p className="mt-5 text-sm leading-relaxed">{p.bio}</p>}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {p.lookingFor && <Box label="Looking for" body={p.lookingFor} />}
          {p.dealBreakers && <Box label="Deal-breakers" body={p.dealBreakers} />}
        </div>

        {p.prompts.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {p.prompts.map((q) => <Box key={q.id} label={q.question} body={q.answer} />)}
          </div>
        )}

        {/* match history */}
        <h2 className="label mt-8">Match history</h2>
        <div className="mt-2 space-y-1.5">
          {matches.length ? matches.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg border border-line bg-white px-3 py-2 text-sm">
              <Link href={`/studio/person/${m.other.id}`} className="hover:underline">{m.other.name}</Link>
              <StageBadge stage={m.stage} />
            </div>
          )) : <p className="text-sm text-muted">No matches yet.</p>}
        </div>

        {/* notes */}
        <h2 className="label mt-8">Notes</h2>
        <form action={saveNote} className="mt-2 flex gap-2">
          <input name="body" placeholder="Add a note (rationale, post-date feedback, anything)..." className="field" />
          <select name="kind" className="field max-w-[8rem]"><option value="general">General</option><option value="rationale">Rationale</option><option value="postdate">Post-date</option></select>
          <button className="btn-primary">Add</button>
        </form>
        <div className="mt-3 space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="rounded-lg border border-line bg-white p-3 text-sm">
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="pill">{n.kind}</span>
                <span>{n.author?.name ?? "system"} · {n.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              </div>
              <p className="mt-1.5">{n.body}</p>
            </div>
          ))}
          {!notes.length && <p className="text-sm text-muted">No notes yet.</p>}
        </div>
      </div>

      {/* sidebar */}
      <aside className="space-y-5">
        {!p.isOperator && (
          <div className="card p-4">
            <p className="label">Suggested candidates</p>
            <p className="mb-2 mt-0.5 text-xs text-muted">Ranked by fit + vouches. Click to create a suggestion.</p>
            <div className="space-y-2">
              {candidates.map((c) => (
                <form key={c.p.id} action={createSuggestion.bind(null, id, c.p.id, `Co-pilot suggested: fit ${c.score.toFixed(2)}, ${c.vouches} vouches.`)}>
                  <button className="flex w-full items-center gap-2 rounded-lg border border-line p-2 text-left text-sm transition hover:border-claret/40">
                    <Avatar url={undefined} name={c.p.name} size={32} />
                    <span className="flex-1">
                      <span className="block font-medium">{c.p.name}</span>
                      <span className="block text-xs text-muted">fit {c.score.toFixed(2)} · {c.vouches} vouches</span>
                    </span>
                    <span className="text-claret">+</span>
                  </button>
                </form>
              ))}
              {!candidates.length && <p className="text-xs text-muted">No open candidates.</p>}
            </div>
          </div>
        )}

        <div className="card p-4">
          <p className="label">Vouches ({vouches.length})</p>
          <div className="mt-2 space-y-2">
            {vouches.map((v) => (
              <div key={v.id} className="text-sm">
                <span className="font-medium">{v.voucher.name}</span>
                {v.note && <p className="text-xs italic text-muted">&ldquo;{v.note}&rdquo;</p>}
              </div>
            ))}
            {!vouches.length && <p className="text-xs text-muted">None yet.</p>}
          </div>
        </div>

        <div className="card p-4">
          <p className="label">Knows ({connections.length})</p>
          <p className="mt-2 text-sm text-muted">{connections.map((c) => c.name.split(" ")[0]).join(", ") || "No connections mapped."}</p>
          {p.referredBy && <p className="mt-2 text-xs text-muted">Referred by {p.referredBy.name}</p>}
        </div>

        <div className="card p-4">
          <p className="label">Dinners ({p.dinnerAttendance.length})</p>
          <div className="mt-2 space-y-1 text-sm text-muted">
            {p.dinnerAttendance.map((d) => <div key={d.id}>{d.dinner.theme} · {d.status}</div>)}
            {!p.dinnerAttendance.length && <p className="text-xs">None.</p>}
          </div>
        </div>

        {p.coachingAsClient.length > 0 && (
          <div className="card p-4">
            <p className="label">Coaching</p>
            <div className="mt-2 space-y-1 text-sm text-muted">
              {p.coachingAsClient.map((c) => <div key={c.id}>{c.type} with {c.coach.name} · {c.sessions} sessions</div>)}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function Box({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <p className="label">{label}</p>
      <p className="mt-1 text-sm">{body}</p>
    </div>
  );
}
