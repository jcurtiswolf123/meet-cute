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
  // Accept rate is measured within the application funnel: of people who actually
  // applied, how many were accepted. Counting all acceptedAt rows (which include
  // seeded/operator-added actives that never applied) let the rate exceed 100%.
  const [applicants, accepted, byStage] = await Promise.all([
    prisma.person.count({ where: { appliedAt: { not: null } } }),
    prisma.person.count({ where: { appliedAt: { not: null }, acceptedAt: { not: null } } }),
    prisma.match.groupBy({ by: ["stage"], _count: true }),
  ]);
  const stageCount = (s: string) => byStage.find((b) => b.stage === s)?._count ?? 0;

  // New applicants awaiting review. Gate on appliedAt so only people who actually
  // completed the application show up here. A bare magic-link click creates an
  // "applicant" row with no appliedAt; surfacing those would bury the operator in
  // half-finished signups.
  const pendingApplicants = await prisma.person.findMany({
    where: {
      isOperator: false,
      isAmbassador: false,
      isCoach: false,
      status: "applicant",
      appliedAt: { not: null },
    },
    include: { photos: true },
    orderBy: { appliedAt: "desc" },
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-medium tracking-tight text-ink">Directory</h1>
        <p className="mt-1 text-sm text-muted">Everyone on the roster, with new applicants to review at a glance.</p>
      </div>

      {/* Asymmetrical metric grid: featured "Together" + balanced row of three */}
      <div className="grid gap-4 md:grid-cols-12 mb-8">
        {/* Featured metric: "Together" spans 2 columns, taller, more visual weight */}
        <div className="md:col-span-5 bg-gradient-to-br from-sage/8 to-champagne/6 rounded-xl2 border border-sage/20 p-6 relative overflow-hidden">
          <div className="relative z-10">
            <div className="label text-sage/70">The goal</div>
            <div className="mt-2 font-display text-5xl font-medium text-sage">{stageCount("relationship")}</div>
            <p className="mt-3 text-sm text-muted">couples in relationships</p>
          </div>
          <div className="absolute -bottom-8 -right-8 text-sage/10 text-9xl font-light">♥</div>
        </div>

        {/* Three balanced metrics in a row */}
        <Metric label="On roster" value={people.length} tone="" />
        <Metric label="In pipeline" value={stageCount("suggested") + stageCount("mutual_yes") + stageCount("date_scheduled")} tone="" />
        <Metric label="Accept rate" value={applicants ? `${Math.round((accepted / applicants) * 100)}%` : "-"} hint="target 20-30%" tone="" />
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

      <div className="mt-8">
        <h2 className="font-display text-lg font-medium text-ink mb-4">Active roster</h2>
        <div className="overflow-x-auto rounded-xl2 border border-line bg-white shadow-sm">
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-line/80 bg-paper/40 text-left text-xs uppercase tracking-widest text-muted/70">
              <tr>
                <th className="px-5 py-4 font-medium">Member</th>
                <th className="px-5 py-4 font-medium">Wants</th>
                <th className="px-5 py-4 font-medium text-center">Vouches</th>
                <th className="px-5 py-4 font-medium text-center">Dinners</th>
                <th className="px-5 py-4 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {enriched.map(({ p, vouches, dinners }, idx) => (
                <tr
                  key={p.id}
                  className={`border-b border-line/50 transition-colors ${
                    idx % 2 === 0 ? "bg-white/50 hover:bg-paper/30" : "bg-cream/20 hover:bg-paper/50"
                  }`}
                >
                  <td className="px-5 py-4">
                    <Link href={`/studio/person/${p.id}`} className="flex items-center gap-3 group">
                      <Avatar url={p.photos[0]?.url} name={p.name} size={40} />
                      <span>
                        <span className="block font-medium text-ink group-hover:text-claret transition-colors">{p.name}{p.age ? `, ${p.age}` : ""}</span>
                        <span className="block text-xs text-muted">{p.city} · {p.neighborhood}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="max-w-[20ch] px-5 py-4 text-sm text-muted">{p.lookingFor?.slice(0, 55)}</td>
                  <td className="px-5 py-4 text-center">
                    {vouches > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-champagne/15 border border-champagne/30 px-2 py-0.5 text-xs font-medium text-champagne">
                        {vouches}
                      </span>
                    ) : (
                      <span className="text-xs text-muted/50">-</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-center text-sm text-muted">{dinners}</td>
                  <td className="px-5 py-4 text-sm text-muted/70">{p.referredBy?.name ?? "direct"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, hint, tone }: { label: string; value: number | string; hint?: string; tone?: string }) {
  return (
    <div className="md:col-span-2 bg-white rounded-xl2 border border-line p-4 shadow-sm hover:shadow-card transition-shadow">
      <div className="label text-claret/60">{label}</div>
      <div className={`mt-2 font-display text-2xl font-medium ${tone === "sage" ? "text-sage" : "text-ink"}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
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
