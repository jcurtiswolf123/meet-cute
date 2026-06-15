import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Avatar } from "@/components/ui";

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

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="On roster" value={people.length} />
        <Metric label="Accept rate" value={applicants ? `${Math.round((accepted / applicants) * 100)}%` : "-"} hint="target 20-30%" />
        <Metric label="In pipeline" value={stageCount("suggested") + stageCount("mutual_yes") + stageCount("date_scheduled")} />
        <Metric label="Together" value={stageCount("relationship")} tone="sage" />
      </div>

      <form className="mt-6 flex flex-wrap items-center gap-2" action="/studio">
        <input name="q" defaultValue={sp.q} placeholder="Search name, headline, what they want..." className="field max-w-xs" />
        <Select name="city" value={sp.city} options={[["", "All cities"], ["NYC", "NYC"], ["SF", "SF"]]} />
        <Select name="gender" value={sp.gender} options={[["", "Any"], ["woman", "Women"], ["man", "Men"]]} />
        <Select name="sort" value={sp.sort} options={[["name", "A-Z"], ["vouches", "Most vouched"], ["stale", "Stalest"]]} />
        <button className="btn-ghost">Filter</button>
      </form>

      <div className="mt-5 overflow-hidden rounded-xl2 border border-line bg-white">
        <table className="w-full text-sm">
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
