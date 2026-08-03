import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOperatorPage } from "@/lib/page-auth";
import { addNote, createSuggestion, hidePhoto } from "@/lib/actions";
import { candidatesFor } from "@/lib/copilot";
import { connectionsOf, vouchesFor } from "@/lib/social";
import { REQUIRED_RECOMMENDATIONS, countsTowardGate } from "@/lib/recommendations";
import { Avatar, StageBadge } from "@/components/ui";
import { SubmitButton, ConfirmActionForm } from "@/components/forms";
import { IntroComposer } from "../../matchmaking/IntroComposer";
import { introNotice } from "../../matchmaking/intro-notice";

export const dynamic = "force-dynamic";

const SUGGEST_MESSAGE: Record<string, string> = {
  created: "Suggestion created. It is in the pipeline.",
  exists: "These two already have a match. Open it from the pipeline.",
  blocked: "These two cannot be matched. One of them blocked the other.",
};

export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ suggest?: string; intro?: string }>;
}) {
  await requireOperatorPage();
  const { id } = await params;
  const sp = await searchParams;
  const suggestNotice = SUGGEST_MESSAGE[sp?.suggest ?? ""];
  const p = await prisma.person.findUnique({
    where: { id },
    include: {
      photos: true,
      prompts: true,
      recommendationsReceived: { orderBy: { createdAt: "asc" } },
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

  // Everyone this person can be introduced to, so the operator is never limited
  // to the four ranked suggestions. Same eligibility rule as the Directory
  // composer: an active roster member with an authorized channel (email, or a
  // textable phone plus recorded SMS consent). The double opt-in email remains
  // the consent point, so `openToMatch` is deliberately not required here.
  const rosterForMatching = p.isOperator
    ? []
    : await prisma.person.findMany({
        where: {
          isOperator: false,
          isAmbassador: false,
          isCoach: false,
          status: "active",
          OR: [{ email: { not: null } }, { AND: [{ phone: { not: null } }, { smsConsentAt: { not: null } }] }],
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          smsConsentAt: true,
          city: true,
          instagram: true,
          bio: true,
          lookingFor: true,
        },
        orderBy: { name: "asc" },
      });
  const composerPeople = rosterForMatching.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    canText: !!c.smsConsentAt,
    city: c.city,
  }));
  // The person can only be the anchor of a new introduction if they are on the
  // roster with a channel of their own.
  const canMatchThisPerson = composerPeople.some((c) => c.id === id);

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
        <Link href="/studio" className="text-xs text-muted hover:text-ink">&larr; Directory</Link>
        <div className="mt-3 flex items-start gap-4">
          <Avatar url={p.photos[0]?.url} name={p.name} size={72} />
          <div>
            <h1 className="font-sans tracking-[-0.012em] text-3xl font-medium">{p.name}{p.age ? `, ${p.age}` : ""}</h1>
            {/* Only join the facts we actually have. The old line printed
                "NYC ·  · operator" for any member who had not filled in a
                neighborhood or gender, which read as a role, not a gap. */}
            <p className="text-sm text-muted">
              {[
                p.city,
                p.neighborhood,
                p.gender ? `${p.gender}, seeking ${p.seeking}` : null,
                p.isOperator ? "operator" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="mt-1 text-sm text-ink">{p.headline}</p>
            {(p.instagram || p.linkedin) && (
              <p className="mt-1.5 flex flex-wrap gap-3 text-sm">
                {p.instagram && (
                  <a href={p.instagram} target="_blank" rel="noopener noreferrer" className="text-ink underline underline-offset-2 hover:opacity-80">
                    Instagram
                  </a>
                )}
                {p.linkedin && (
                  <a href={p.linkedin} target="_blank" rel="noopener noreferrer" className="text-ink underline underline-offset-2 hover:opacity-80">
                    LinkedIn
                  </a>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Photos are live the moment a member uploads them, so this is not a
            review queue. It is the one place an operator can take a photo down
            after the fact: a report, or plainly not the person. Hiding writes
            "rejected", and every surface that renders a photo filters on
            "approved", so it disappears everywhere at once. */}
        {p.photos.length > 0 && (
          <div className="mt-5">
            <p className="label text-muted">Photos</p>
            <div className="mt-2 flex flex-wrap gap-3">
              {p.photos
                .filter((photo) => photo.status !== "rejected")
                .map((photo) => (
                  <figure key={photo.id} className="w-24">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={`${p.name}, photo ${photo.order + 1}`}
                      className="h-24 w-24 rounded-lg border border-line object-cover"
                    />
                    <ConfirmActionForm
                      action={hidePhoto}
                      confirmMessage="Hide this photo everywhere?"
                      triggerLabel="Hide"
                      triggerAriaLabel={`Hide photo ${photo.order + 1} for ${p.name}`}
                      confirmLabel="Hide it"
                      pendingText="Hiding..."
                      buttonClassName="mt-1 text-xs text-muted underline underline-offset-2 hover:text-ink"
                    >
                      <input type="hidden" name="photoId" value={photo.id} />
                    </ConfirmActionForm>
                  </figure>
                ))}
            </div>
            {p.photos.some((photo) => photo.status === "rejected") && (
              <p className="mt-2 text-xs text-muted">
                {p.photos.filter((photo) => photo.status === "rejected").length} hidden by an operator.
              </p>
            )}
          </div>
        )}

        {p.bio && <p className="mt-5 text-sm leading-relaxed">{p.bio}</p>}

        {/* Recommendations the applicant's friends actually wrote. These are
            what accept an applicant, so an operator looking at a profile needs
            to see who was asked and who has answered, not only the one line
            copied onto Person.recommendation. */}
        {p.recommendationsReceived.length > 0 && (
          <div className="mt-5 rounded-xl border border-ink/25 bg-studio-canvas p-4">
            <p className="label text-ink">
              Recommendations{" "}
              <span className="font-normal text-muted">
                {p.recommendationsReceived.filter((r) => r.status === "submitted").length} of{" "}
                {REQUIRED_RECOMMENDATIONS} written
              </span>
            </p>
            <ul className="mt-2 space-y-3">
              {p.recommendationsReceived.map((rec) => (
                <li key={rec.id} className="border-t border-ink/10 pt-3 first:border-t-0 first:pt-0">
                  <p className="text-xs text-muted">
                    <span className="font-medium text-ink">{rec.name}</span>
                    {` · ${rec.gender} · ${rec.email}`}
                    {rec.status === "submitted"
                      ? ""
                      : rec.remindedAt
                        ? " · nudged, no reply yet"
                        : " · asked, no reply yet"}
                    {countsTowardGate(p.gender, rec.gender) ? "" : " · does not count toward the two"}
                  </p>
                  {rec.body && (
                    <p className="mt-1.5 text-sm italic leading-relaxed text-ink/85">&ldquo;{rec.body}&rdquo;</p>
                  )}
                  {rec.relationship && <p className="mt-1 text-xs text-muted">{rec.relationship}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {p.recommendationsReceived.length === 0 && (p.recommendation || p.voucherName) && (
          <div className="mt-5 rounded-xl border border-ink/25 bg-studio-canvas p-4">
            <p className="label text-ink">Recommendation</p>
            {p.recommendation && <p className="mt-1.5 text-sm italic leading-relaxed text-ink/85">&ldquo;{p.recommendation}&rdquo;</p>}
            {p.voucherName && (
              <p className="mt-2 text-xs text-muted">
                Vouched for by <span className="font-medium text-ink">{p.voucherName}</span>
                {p.voucherContact ? ` · ${p.voucherContact}` : ""}
              </p>
            )}
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {p.lookingFor && <Box label="Looking for" body={p.lookingFor} />}
          {p.dealBreakers && <Box label="Deal-breakers" body={p.dealBreakers} />}
        </div>

        {p.prompts.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {p.prompts.map((q) => <Box key={q.id} label={q.question} body={q.answer} />)}
          </div>
        )}

        {/* Match anyone on the roster, not only the ranked suggestions. Sends the
            same double opt-in introduction the Directory composer sends. */}
        {!p.isOperator && (
          <>
            <h2 className="label mt-8">Match {p.name.split(" ")[0]} with someone</h2>
            {canMatchThisPerson ? (
              <div className="mt-2">
                <IntroComposer
                  people={composerPeople}
                  lockedAId={id}
                  returnTo={`/studio/person/${id}`}
                  notice={introNotice(sp?.intro)}
                  title={`Introduce ${p.name.split(" ")[0]} to anyone on the list`}
                  intro="Search the full list, not just the ranked suggestions. Both people get a private invite and are only connected after they both say yes."
                />
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">
                {p.status === "active"
                  ? "This person has no authorized delivery channel yet. Add an email or record explicit text consent before introducing them."
                  : "Approve this person onto the list before introducing them."}
              </p>
            )}
          </>
        )}

        {/* match history */}
        <h2 className="label mt-8">Match history</h2>
        <div className="mt-2 space-y-1.5">
          {matches.length ? matches.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel px-3 py-2 text-sm">
              <Link href={`/studio/person/${m.other.id}`} className="font-medium hover:underline">{m.other.name}</Link>
              <span className="flex items-center gap-3">
                <StageBadge stage={m.stage} />
                <Link href={`/studio/conversations/${m.id}`} className="text-xs text-ink hover:underline">
                  Open thread
                </Link>
              </span>
            </div>
          )) : <p className="text-sm text-muted">No matches yet.</p>}
        </div>

        {/* notes */}
        <h2 className="label mt-8">Notes</h2>
        <form action={saveNote} className="mt-2 flex gap-2">
          <input name="body" placeholder="Add a note (rationale, post-date feedback, anything)..." className="field" />
          <select name="kind" className="field max-w-[8rem]"><option value="general">General</option><option value="rationale">Rationale</option><option value="postdate">Post-date</option></select>
          <SubmitButton className="btn-primary" pendingText="...">Add</SubmitButton>
        </form>
        <div className="mt-3 space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="rounded-lg border border-line bg-panel p-3 text-sm">
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
            {suggestNotice && (
              <p
                role="status"
                className="mb-2 rounded-lg border border-studio-line bg-studio-subtle px-3 py-2 text-xs text-ink"
              >
                {suggestNotice}
              </p>
            )}
            <div className="space-y-2">
              {candidates.map((c) => (
                <form key={c.p.id} action={createSuggestion.bind(null, id, c.p.id, `Co-pilot suggested: fit ${c.score.toFixed(2)}, ${c.vouches} vouches.`)}>
                  <button className="flex w-full items-center gap-2 rounded-lg border border-line p-2 text-left text-sm transition hover:border-studio-line">
                    <Avatar url={undefined} name={c.p.name} size={32} />
                    <span className="flex-1">
                      <span className="block font-medium">{c.p.name}</span>
                      <span className="block text-xs text-muted">fit {c.score.toFixed(2)} · {c.vouches} vouches</span>
                    </span>
                    <span className="text-ink">+</span>
                  </button>
                </form>
              ))}
              {!candidates.length && <p className="text-xs text-muted">No open candidates.</p>}
            </div>
          </div>
        )}

        {/* Vouches, Knows, Dinners and Coaching were four separate cards
            stacked down the sidebar. None of them is interactive: they are
            read-only sections, and a border and shadow around each added
            chrome without adding information. One panel, divided. The
            candidates block above stays a card because clicking it is the
            interaction. */}
        <div className="overflow-hidden rounded-lg border border-studio-line bg-studio-panel">
          <section className="border-b border-studio-line p-4">
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
          </section>

          <section className="border-b border-studio-line p-4">
            <p className="label">Knows ({connections.length})</p>
            <p className="mt-2 text-sm text-muted">{connections.map((c) => c.name).join(", ") || "No connections mapped."}</p>
            {p.referredBy && <p className="mt-2 text-xs text-muted">Referred by {p.referredBy.name}</p>}
          </section>

          <section className={p.coachingAsClient.length > 0 ? "border-b border-studio-line p-4" : "p-4"}>
            <p className="label">Dinners ({p.dinnerAttendance.length})</p>
            <div className="mt-2 space-y-1 text-sm text-muted">
              {p.dinnerAttendance.map((d) => <div key={d.id}>{d.dinner.theme} · {d.status}</div>)}
              {!p.dinnerAttendance.length && <p className="text-xs">None.</p>}
            </div>
          </section>

          {p.coachingAsClient.length > 0 && (
            <section className="p-4">
              <p className="label">Coaching</p>
              <div className="mt-2 space-y-1 text-sm text-muted">
                {p.coachingAsClient.map((c) => <div key={c.id}>{c.type} with {c.coach.name} · {c.sessions} sessions</div>)}
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}

function Box({ label, body }: { label: string; body: string }) {
  return (
    // data-field names the box so a test can assert on the profile's own copy
    // rather than any other place the same sentence appears on the page (the
    // introduction composer seeds its About box from the same field).
    <div data-field={label} className="rounded-lg border border-line bg-panel p-3">
      <p className="label">{label}</p>
      <p className="mt-1 text-sm">{body}</p>
    </div>
  );
}
