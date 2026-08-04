import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOperatorPage } from "@/lib/page-auth";
import { Avatar } from "@/components/ui";
import { Select as FieldSelect } from "@/components/select";
import { CITIES, citiesOf, cityShort, cityWhere } from "@/lib/cities";
import { ApproveApplicant } from "./ApproveApplicant";
import { retryDeliveryJob, setMemberStatus } from "@/lib/actions";
import { IntroComposer } from "./matchmaking/IntroComposer";
import { introNotice } from "./matchmaking/intro-notice";

export const dynamic = "force-dynamic";

export default async function Roster({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; city?: string; gender?: string; sort?: string; intro?: string }>;
}) {
  await requireOperatorPage();
  const sp = await searchParams;
  const q = (sp.q ?? "").toLowerCase();

  const people = await prisma.person.findMany({
    where: {
      isOperator: false,
      isAmbassador: false,
      isCoach: false,
      status: "active",
      // Either slot: someone who splits their time is in both markets, and a
      // filter that only reads the primary hides half of them.
      ...(sp.city ? cityWhere(sp.city) : {}),
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
    // Email and phone are searchable too: an operator who has a reply in their
    // inbox and wants the member behind it was searching by name and failing.
    .filter(
      ({ p }) =>
        !q ||
        `${p.name} ${p.headline} ${p.bio} ${p.lookingFor} ${p.email ?? ""} ${p.phone ?? ""}`
          .toLowerCase()
          .includes(q)
    );

  if (sp.sort === "vouches") enriched.sort((a, b) => b.vouches - a.vouches);
  else if (sp.sort === "stale") enriched.sort((a, b) => (a.lastSuggested?.getTime() ?? 0) - (b.lastSuggested?.getTime() ?? 0));
  else enriched.sort((a, b) => a.p.name.localeCompare(b.p.name));

  // People the operator can introduce straight from the directory. Anyone active
  // with an authorized channel (an email, or a textable phone plus SMS consent)
  // qualifies - the double opt-in email is the member's consent point, so this
  // intentionally does not wait on the member-app `openToMatch` toggle. The list
  // reuses the already-fetched scalar fields, so no extra query is needed.
  const composerPeople = people
    .filter((p) => p.email || (p.phone && p.smsConsentAt))
    .map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      canText: !!p.smsConsentAt,
      city: p.city,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

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
    include: { photos: true, recommendationsReceived: { orderBy: { createdAt: "asc" } } },
    orderBy: { appliedAt: "desc" },
  });
  const [failedDeliveryCount, failedDeliveries] = await Promise.all([
    prisma.deliveryJob.count({ where: { status: "failed" } }),
    prisma.deliveryJob.findMany({
      where: { status: "failed" },
      select: {
        id: true,
        kind: true,
        channel: true,
        recipient: true,
        attempts: true,
        lastError: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
  ]);

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-sans tracking-[-0.012em] text-2xl font-medium">Directory</h1>
        <p className="mt-1 text-sm text-muted">Everyone on the list, with new applicants to review at a glance.</p>
      </div>
      {/* Order follows what an operator actually does in a session: clear
          anything blocking first, then make a match, then browse the list.
          Metrics are ambient context, so they sit under the work rather than
          above it, where they were the first thing read every single visit. */}
      {failedDeliveries.length > 0 && (
        <section
          className="mt-6 rounded-xl2 border border-studio-line border-l-2 border-l-ink bg-studio-subtle p-5"
          aria-labelledby="delivery-failures-heading"
        >
          <h2 id="delivery-failures-heading" className="label !text-ink">
            Delivery failures ({failedDeliveryCount})
          </h2>
          <p className="mt-1 text-sm text-muted">
            These messages exhausted their retries or were rejected permanently. Fix the provider
            or recipient issue before retrying. Showing the 10 most recent.
          </p>
          <ul className="mt-4 space-y-2">
            {failedDeliveries.map((job) => (
              <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-2.5">
                <span>
                  <span className="block text-sm font-medium text-ink">
                    {humanizeDeliveryKind(job.kind)} via {job.channel} to {maskRecipient(job.recipient)}
                  </span>
                  <span className="block text-xs text-muted">
                    {job.lastError || "Provider rejected the message."} Attempt {job.attempts}.{" "}
                    {job.updatedAt.toLocaleString("en-US")}
                  </span>
                </span>
                <form action={retryDeliveryJob}>
                  <input type="hidden" name="deliveryJobId" value={job.id} />
                  <button
                    className="rounded-full border border-ink/25 px-3 py-1 text-xs font-medium text-ink transition hover:bg-ink hover:text-white"
                    aria-label={`Retry ${humanizeDeliveryKind(job.kind)} via ${job.channel} to ${maskRecipient(job.recipient)}`}
                  >
                    Retry
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
      {pendingApplicants.length > 0 && (
        <div className="mt-6 rounded-xl2 border border-studio-line border-l-2 border-l-ink bg-studio-subtle p-5">
          <p className="label !text-ink">New applicants ({pendingApplicants.length})</p>
          <p className="mt-1 text-sm text-muted">Review and approve to add them to the list.</p>
          <ul className="mt-4 space-y-2">
            {pendingApplicants.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-2.5">
                <Link href={`/studio/person/${a.id}`} className="flex items-center gap-3">
                  <Avatar url={a.photos[0]?.url} name={a.name} size={32} />
                  <span>
                    <span className="block text-sm font-medium text-ink">{a.name}{a.age ? `, ${a.age}` : ""}</span>
                    <span className="block text-xs text-muted">
                      {a.email} · {citiesOf(a).map(cityShort).join(" + ")}
                    </span>
                    {/* What the gate is waiting on, in the list where the
                        Approve button lives. Approving here is what let two
                        applicants in before their friends wrote. */}
                    {a.recommendationsReceived.length > 0 && (
                      <span className="mt-0.5 block text-xs text-muted">
                        {a.recommendationsReceived.filter((r) => r.status === "submitted").length} of{" "}
                        {a.recommendationsReceived.length} friends have written
                        {a.recommendationsReceived.some((r) => r.status === "requested")
                          ? `, waiting on ${a.recommendationsReceived
                              .filter((r) => r.status === "requested")
                              .map((r) => r.name.split(" ")[0])
                              .join(" and ")}`
                          : ""}
                      </span>
                    )}
                    {a.voucherName && (
                      <span className="mt-0.5 block text-xs font-medium text-ink">
                        Vouched by {a.voucherName}
                        {a.recommendation ? `: "${a.recommendation.slice(0, 80)}${a.recommendation.length > 80 ? "..." : ""}"` : ""}
                      </span>
                    )}
                  </span>
                </Link>
                <div className="flex gap-2">
                  <ApproveApplicant
                    personId={a.id}
                    name={a.name}
                    outstanding={a.recommendationsReceived.filter((r) => r.status === "requested").length}
                  />
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
      {/* Make a match without leaving the directory. Pick two members, add a
          line about each, and send the double opt-in introductions in one step. */}
      <details open className="mt-6">
        <summary className="cursor-pointer list-none">
          <span className="text-sm font-semibold text-ink">Make a match</span>
          <span className="ml-2 text-sm text-muted">Introduce two members straight from the list.</span>
        </summary>
        <div className="mt-3">
          <IntroComposer people={composerPeople} returnTo="/studio" notice={introNotice(sp.intro)} />
        </div>
      </details>
      {/* Metrics ledger. "Together" is the north-star outcome, so it earns weight
          and a panel tint rather than a colour the rest of the console never uses. */}
      <div className="ledger mt-8">
        <div className="ledger-cell">
          <div className="ledger-num">{people.length}</div>
          <div className="ledger-label">On list</div>
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
        <div className="ledger-cell bg-studio-canvas">
          <div className="ledger-num font-semibold text-ink">{stageCount("relationship")}</div>
          <div className="ledger-label">Together</div>
        </div>
      </div>
      <form className="mt-6 flex flex-wrap items-center gap-2" action="/studio">
        <input name="q" aria-label="Search directory" defaultValue={sp.q} placeholder="Search name, headline, what they want..." className="field max-w-xs" />
        <Select
          label="Filter by city"
          name="city"
          value={sp.city}
          options={[["", "All cities"], ...CITIES.map((c) => [c.value, c.short] as [string, string])]}
        />
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
              <th>Contact</th>
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
                      <span className="block text-xs text-muted">
                        {citiesOf(p).map(cityShort).join(" + ")}
                        {p.neighborhood ? ` · ${p.neighborhood}` : ""}
                      </span>
                    </span>
                  </Link>
                </td>
                {/* Jess's ask, 2026-08-02: an operator needs to be able to
                    reach a member from the list rather than opening the
                    profile to find out how. Live mailto/tel links, not text,
                    and the SMS-consent state is shown because texting someone
                    who never consented is the one contact route with a legal
                    edge to it. */}
                <td className="text-xs">
                  {p.email ? (
                    <a href={`mailto:${p.email}`} className="block break-all text-ink hover:underline">
                      {p.email}
                    </a>
                  ) : (
                    <span className="block text-muted">no email</span>
                  )}
                  {p.phone ? (
                    <a href={`tel:${p.phone}`} className="mt-0.5 block text-ink hover:underline">
                      {formatPhone(p.phone)}
                      {!p.smsConsentAt && <span className="ml-1 text-muted">(no SMS consent)</span>}
                    </a>
                  ) : (
                    <span className="mt-0.5 block text-muted">no phone</span>
                  )}
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

/** E.164 is what we store and what `tel:` needs; this is only for reading. */
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return phone;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

function humanizeDeliveryKind(kind: string): string {
  return kind.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function maskRecipient(recipient: string): string {
  if (recipient.includes("@")) {
    const [local, domain] = recipient.split("@");
    return `${local.slice(0, 1)}***@${domain || "unknown"}`;
  }
  const digits = recipient.replace(/\D/g, "");
  return digits.length >= 4 ? `ending ${digits.slice(-4)}` : "recipient";
}

// Thin wrapper over the shared listbox: the filter bar was written against a
// [value, label] tuple list, and the shared control takes objects. Applying on
// change removes the "now press Filter" step, which the search box still needs
// because a text field has no moment where the operator is obviously done.
function Select({ label, name, value, options }: { label: string; name: string; value?: string; options: [string, string][] }) {
  return (
    <FieldSelect
      label={label}
      name={name}
      defaultValue={value ?? options[0][0]}
      options={options.map(([optionValue, optionLabel]) => ({ value: optionValue, label: optionLabel }))}
      submitOnChange
      className="w-[10rem]"
    />
  );
}
