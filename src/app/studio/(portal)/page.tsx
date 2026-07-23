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
      <div className="mb-5">
        <h1 className="font-display text-2xl font-medium">Directory</h1>
        <p className="mt-1 text-sm text-muted">Everyone on the roster, with new applicants to review at a glance.</p>
      </div>
      {/* Metrics ledger: "Together" (the north-star outcome) carries the sage accent */}
      <div className="ledger">
        <div className="ledger-cell">
          <div className="ledger-num">{people.length}</div>
          <div className="ledger-label">On roster</div>
        </div>
        <div className="ledger-cell">
          <div className="ledger-num">{applicants ? `${Math.round((accepted / applicants) * 100)}%` : "-"}</div>
          <div className="ledger-label">Accept rate</div>
          <div className="text-[10px] text-muted">target 20-30%</div>
        </div>
        <div className="ledger-cell">
          <div className="ledger-num">{stageCount("suggested") + stageCount("mutual_yes") + stageCount("date_scheduled")}</div>
          <div className="ledger-label">In pipeline</div>
        </div>
        <div className="ledger-cell bg-sage/[0.06]">
          <div className="ledger-num text-sage">{stageCount("relationship")}</div>
          <div className="ledger-label">Together</div>
        </div>
      </div>

      {pendingApplicants.length > 0 && (
        <div className="mt-6 rounded-xl2 border border-claret/25 bg-claret/5 p-5">
          <p className="label text-claret">New applicants ({pendingApplicants.length})</p>
          <p className="mt-1 text-sm text-muted">Review and approve to add them to the roster.</p>
          <ul className="mt-4 space-y-2">
            {pendingApplicants.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-2.5">
                <Link href={`/studio/person/${a.id}`} className="flex items-center gap-3">
                  <Avatar url={a.photos[0]?.url} name={a.name} size={32} />
                  <span>
                    <span className="block text-sm font-medium text-ink">{a.name}{a.age ? `, ${a.age}` : ""}</span>
                    <span className="block text-xs text-muted">{a.email} · {a.city}</span>
                    {a.voucherName && (
                      <span className="mt-0.5 block text-xs text-sage">
                        Vouched by {a.voucherName}
                        {a.recommendation ? `: "${a.recommendation.slice(0, 80)}${a.recommendation.length > 80 ? "..." : ""}"` : ""}
                      </span>
                    )}
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
        <input name="q" aria-label="Search directory" defaultValue={sp.q} placeholder="Search name, headline, what they want..." className="field max-w-xs" />
        <Select label="Filter by city" name="city" value={sp.city} options={[["", "All cities"], ["NYC", "NYC"], ["SF", "SF"]]} />
        <Select label="Filter by gender" name="gender" value={sp.gender} options={[["", "Any"], ["woman", "Women"], ["man", "Men"]]} />
        <Select label="Sort directory" name="sort" value={sp.sort} options={[["name", "A-Z"], ["vouches", "Most vouched"], ["stale", "Stalest"]]} />
        <button className="btn-ghost">Filter</button>
      </form>

      <div
        className="mt-5 overflow-x-auto rounded-xl2 border border-line bg-panel shadow-card"
        role="region"
        aria-label="Member directory table"
        tabIndex={0}
      >
        <table className="roster min-w-[640px]">
          <thead>
            <tr>
              <th>Member</th>
              <th>Wants</th>
              <th>Vouches</th>
              <th>Dinners</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {enriched.map(({ p, vouches, dinners }) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/studio/person/${p.id}`} className="flex items-center gap-3">
                    <Avatar url={p.photos[0]?.url} name={p.name} size={36} />
                    <span>
                      <span className="block font-medium text-ink">{p.name}{p.age ? `, ${p.age}` : ""}</span>
                      <span className="block text-xs text-muted">{p.city} · {p.neighborhood}</span>
                    </span>
                  </Link>
                </td>
                <td className="max-w-[22ch] text-muted">{p.lookingFor?.slice(0, 60)}</td>
                <td>{vouches > 0 ? <span className="pill">{vouches}</span> : <span className="text-muted">-</span>}</td>
                <td className="text-muted">{dinners}</td>
                <td className="text-muted">{p.referredBy?.name ?? "direct"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Select({ label, name, value, options }: { label: string; name: string; value?: string; options: [string, string][] }) {
  return (
    <select aria-label={label} name={name} defaultValue={value} className="field max-w-[10rem]">
      {options.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}
