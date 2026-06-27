import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Avatar } from "@/components/ui";
import { setMemberStatus } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function Roster({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; city?: string; gender?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").toLowerCase();

  const people = await prisma.person.findMany({
    where: {
      isOperator: false,
      isAmbassador: false,
      isCoach: false,
      status: "active",
      ...(sp.city ? { city: sp.city } : {}),
      ...(sp.gender ? { gender: sp.gender } : {}),
    },
    include: {
      photos: true,
      vouchesReceived: true,
      referredBy: { select: { name: true } },
      matchesAsA: { select: { createdAt: true, stage: true } },
      matchesAsB: { select: { createdAt: true, stage: true } },
      dinnerAttendance: { select: { id: true } },
    },
  });

  const enriched = people
    .map((p) => {
      const matches = [...p.matchesAsA, ...p.matchesAsB];
      const last = matches.map((m) => m.createdAt).sort((a, b) => b.getTime() - a.getTime())[0];
      return { p, vouches: p.vouchesReceived.length, lastSuggested: last, dinners: p.dinnerAttendance.length, active: matches.length };
    })
    .filter(({ p }) => !q || `${p.name} ${p.headline} ${p.bio} ${p.lookingFor}`.toLowerCase().includes(q));

  if (sp.sort === "vouches") enriched.sort((a, b) => b.vouches - a.vouches);
  else if (sp.sort === "stale") enriched.sort((a, b) => (a.lastSuggested?.getTime() ?? 0) - (b.lastSuggested?.getTime() ?? 0));
  else enriched.sort((a, b) => a.p.name.localeCompare(b.p.name));

  // metrics
  const [applicants, accepted, byStage] = await Promise.all([
    prisma.person.count({ where: { appliedAt: { not: null } } }),
    prisma.person.count({ where: { acceptedAt: { not: null } } }),
    prisma.match.groupBy({ by: ["stage"], _count: true }),
  ]);
  const stageCount = (s: string) => byStage.find((b) => b.stage === s)?._count ?? 0;

  // New applicants awaiting review (what a fresh magic-link signup creates).
  const pendingApplicants = await prisma.person.findMany({
    where: { isOperator: false, isAmbassador: false, isCoach: false, status: "applicant" },
    include: { photos: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-2xl font-medium">Directory</h1>
        <p className="mt-1 text-sm text-muted">Everyone on the roster, with new applicants to review at a glance.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="On roster" value={people.length} />
        <Metric label="Accept rate" value={applicants ? `${Math.round((accepted / applicants) * 100)}%` : "-"} hint="target 20-30%" />
        <Metric label="In pipeline" value={stageCount("suggested") + stageCount("mutual_yes") + stageCount("date_scheduled")} />
        <Metric label="Together" value={stageCount("relationship")} tone="sage" />
      </div>

      {pendingApplicants.length > 0 && (
        <div className="mt-6 rounded-xl2 border border-claret/25 bg-claret/5 p-5">
          <p className="label text-claret">New applicants ({pendingApplicants.length})</p>
          <p className="mt-1 text-sm text-muted">Review and approve to add them to the roster.</p>
          <ul className="mt-4 space-y-2">
            {pendingApplicants.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-2.5">
                <Link href={`/studio/person/${a.id}`} className="flex items-center gap-3">
                  <Avatar url={a.photos[0]?.url} name={a.name} size={32} />
                  <span>
                    <span className="block text-sm font-medium text-ink">{a.name}{a.age ? `, ${a.age}` : ""}</span>
                    <span className="block text-xs text-muted">{a.email} · {a.city}</span>
                  </span>
                </Link>
                <div className="flex gap-2">
                  <form action={setMemberStatus}>
                    <input type="hidden" name="personId" value={a.id} />
                    <input type="hidden" name="action" value="approve" />
                    <button className="rounded-full bg-claret px-3 py-1 text-xs font-medium text-white">Approve</button>
                  </form>
                  <form action={setMemberStatus}>
                    <input type="hidden" name="personId" value={a.id} />
                    <input type="hidden" name="action" value="decline" />
                    <button className="rounded-full border border-line px-3 py-1 text-xs">Decline</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className="mt-6 flex flex-wrap items-center gap-2" action="/studio">
        <input name="q" defaultValue={sp.q} placeholder="Search name, headline, what they want..." className="field max-w-xs" />
        <Select name="city" value={sp.city} options={[["", "All cities"], ["NYC", "NYC"], ["SF", "SF"]]} />
        <Select name="gender" value={sp.gender} options={[["", "Any"], ["woman", "Women"], ["man", "Men"]]} />
        <Select name="sort" value={sp.sort} options={[["name", "A-Z"], ["vouches", "Most vouched"], ["stale", "Stalest"]]} />
        <button className="btn-ghost">Filter</button>
      </form>

      <div className="mt-5 overflow-x-auto rounded-xl2 border border-line bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line bg-paper/60 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Member</th>
              <th className="px-4 py-3 font-medium">Wants</th>
              <th className="px-4 py-3 font-medium">Vouches</th>
              <th className="px-4 py-3 font-medium">Dinners</th>
              <th className="px-4 py-3 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {enriched.map(({ p, vouches, dinners }) => (
              <tr key={p.id} className="border-b border-line/70 hover:bg-cream/60">
                <td className="px-4 py-3">
                  <Link href={`/studio/person/${p.id}`} className="flex items-center gap-3">
                    <Avatar url={p.photos[0]?.url} name={p.name} size={36} />
                    <span>
                      <span className="block font-medium text-ink">{p.name}, {p.age}</span>
                      <span className="block text-xs text-muted">{p.city} · {p.neighborhood}</span>
                    </span>
                  </Link>
                </td>
                <td className="max-w-[22ch] px-4 py-3 text-muted">{p.lookingFor?.slice(0, 60)}</td>
                <td className="px-4 py-3">{vouches > 0 ? <span className="pill">{vouches}</span> : <span className="text-muted">-</span>}</td>
                <td className="px-4 py-3 text-muted">{dinners}</td>
                <td className="px-4 py-3 text-muted">{p.referredBy?.name ?? "direct"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({ label, value, hint, tone }: { label: string; value: number | string; hint?: string; tone?: string }) {
  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className={`mt-1 font-display text-3xl ${tone === "sage" ? "text-sage" : "text-ink"}`}>{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

function Select({ name, value, options }: { name: string; value?: string; options: [string, string][] }) {
  return (
    <select name={name} defaultValue={value} className="field max-w-[10rem]">
      {options.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}
