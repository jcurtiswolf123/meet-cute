import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOperatorPage } from "@/lib/page-auth";
import {
  quickAddPerson,
  resendIntro,
  closeIntroduction,
  connectIntroNow,
  askForFeedback,
  setIntroFollowUp,
} from "@/lib/actions";
import { IntroComposer } from "./IntroComposer";
import { introNotice } from "./intro-notice";
import { pairStates } from "@/lib/introductions";
import { Avatar } from "@/components/ui";
import { ConfirmActionForm } from "@/components/forms";
import { Select } from "@/components/select";
import { Checkbox } from "@/components/fields";
import { CITIES } from "@/lib/cities";

export const dynamic = "force-dynamic";

// The operator console shows whole names. Truncating to a first name is a
// member-facing privacy rule (someone deciding whether to meet you should not
// be able to look you up first), and it has no business here: two members can
// share a first name, and "Jess + Jessica" told the operator nothing.
function displayName(name: string) {
  return name.trim() || name;
}

type Decision = "pending" | "yes" | "pass";

function statusFor(m: { stage: string; aDecision: string; bDecision: string; personA: { name: string }; personB: { name: string } }) {
  const a = m.aDecision as Decision;
  const b = m.bDecision as Decision;
  if (m.stage === "connected") return { label: "Connected", tone: "bg-studio-canvas text-ink border-ink/25" };
  if (m.stage === "exit") {
    const passer = a === "pass" ? displayName(m.personA.name) : b === "pass" ? displayName(m.personB.name) : null;
    return { label: passer ? `${passer} passed` : "Closed", tone: "bg-studio-subtle text-muted border-line" };
  }
  if (a === "yes" && b === "pending") return { label: `${displayName(m.personA.name)} said yes`, tone: "bg-studio-subtle text-ink border-studio-line" };
  if (b === "yes" && a === "pending") return { label: `${displayName(m.personB.name)} said yes`, tone: "bg-studio-subtle text-ink border-studio-line" };
  return { label: "Awaiting both", tone: "bg-champagne/20 text-ink border-champagne/40" };
}

export default async function Matchmaking({
  searchParams,
}: {
  searchParams?: Promise<{ intro?: string; with?: string }>;
}) {
  await requireOperatorPage();
  const sp = await searchParams;

  const [people, intros, pairs] = await Promise.all([
    prisma.person.findMany({
      where: { isOperator: false, isAmbassador: false, isCoach: false, status: "active" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        city: true,
        bio: true,
        openToMatch: true,
        lookingFor: true,
        linkedin: true,
        instagram: true,
        smsConsentAt: true,
        photos: { where: { status: { not: "rejected" } }, orderBy: { order: "asc" }, take: 1, select: { url: true } },
      },
      orderBy: [{ openToMatch: "desc" }, { name: "asc" }],
    }),
    prisma.match.findMany({
      where: { stage: { in: ["invited", "mutual_yes", "connected"] } },
      include: {
        personA: { select: { id: true, name: true, phone: true } },
        personB: { select: { id: true, name: true, phone: true } },
        notes: { where: { kind: "feedback" }, orderBy: { createdAt: "desc" }, select: { id: true, body: true, createdAt: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    pairStates(),
  ]);

  const ready = people.filter((p) => p.openToMatch).length;
  const awaiting = intros.filter((m) => m.stage !== "connected").length;
  const connected = intros.filter((m) => m.stage === "connected").length;
  const noPhone = people.filter((p) => !p.phone).length;

  // Composer leads with people who've opted in (those are the ones to match).
  // Only identity and reachability travel here: the invitation itself is built
  // from each person's own profile at send time, so nothing is copied through.
  const composerPeople = people.filter((p) => p.openToMatch).map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    phone: p.phone,
    canText: !!p.smsConsentAt,
    city: p.city,
    photoUrl: p.photos[0]?.url ?? null,
    lookingFor: p.lookingFor,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-sans tracking-[-0.012em] text-2xl font-medium">Matchmaking</h1>
        <p className="mt-1 text-sm text-muted">
          Manage private introductions, decisions, and mutual email connections in one place.
        </p>
      </div>

      {/* KPI ledger: one editorial strip, lead metric tinted claret */}
      <div className="ledger">
        {[
          { label: "Ready to match", value: ready, lead: true },
          { label: "Awaiting replies", value: awaiting },
          { label: "Connected", value: connected },
          { label: "People", value: people.length },
          { label: "Missing a phone", value: noPhone },
        ].map((k) => (
          <div key={k.label} className={`ledger-cell${k.lead ? " ledger-cell-lead" : ""}`}>
            <div className="ledger-num">{k.value}</div>
            <div className="ledger-label">{k.label}</div>
          </div>
        ))}
      </div>

      <IntroComposer
        people={composerPeople}
        pairs={pairs}
        defaultBId={sp?.with}
        returnTo="/studio/matchmaking"
        notice={introNotice(sp?.intro)}
      />

      {/* Quick-add a person. Stays open (a server-action submit re-renders and
          would otherwise re-collapse it, re-charging the expand click each add). */}
      <details open className="card p-5">
        <summary className="cursor-pointer font-sans tracking-[-0.012em] text-lg font-medium">Add someone to match</summary>
        <p className="mt-1 text-sm text-muted">
          Add someone only after they ask to be matched. Email is the baseline channel. Texting is optional and needs separate consent.
        </p>
        <form action={quickAddPerson} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Name</span>
            <input name="name" required placeholder="Jordan Rivera" className="field mt-1.5" />
          </label>
          <label className="block">
            <span className="label">Mobile number (optional)</span>
            <input name="phone" type="tel" placeholder="(555) 123-4567" className="field mt-1.5" />
          </label>
          <Select
            name="city"
            label="City"
            showLabel
            defaultValue="NYC"
            options={CITIES.map((c) => ({ value: c.value, label: c.short }))}
          />
          <label className="block">
            <span className="label">Email (optional)</span>
            <input name="email" type="email" placeholder="optional" className="field mt-1.5" />
          </label>
          <label className="block">
            <span className="label">Instagram (optional)</span>
            <input name="instagram" placeholder="@handle or link" className="field mt-1.5" />
          </label>
          <label className="block">
            <span className="label">LinkedIn (optional)</span>
            <input name="linkedin" placeholder="handle or link" className="field mt-1.5" />
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Notes about them (optional)</span>
            <input name="blurb" placeholder="Founder, loves trail running, wants something serious." className="field mt-1.5" />
          </label>
          <Checkbox name="matchingConsent" required className="sm:col-span-2">
            I confirm this person asked to be added to Mutuals and is ready to receive matchmaking introductions.
          </Checkbox>
          <Checkbox name="smsConsent" className="sm:col-span-2">
            I confirm this person separately agreed to receive Mutuals text messages at the mobile number above. Message and data rates may apply. Reply STOP to cancel.
          </Checkbox>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary">Add person</button>
          </div>
        </form>
      </details>

      {/* Introductions board */}
      <div>
        <h2 className="font-sans tracking-[-0.012em] text-lg font-medium">Introductions</h2>
        {intros.length === 0 ? (
          <div className="card mt-3 p-8 text-center text-sm text-muted">
            No introductions yet. Pick two people above and send your first introduction.
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {intros.map((m) => {
              const s = statusFor(m);
              const isConnected = m.stage === "connected";
              return (
                <div key={m.id} className="card flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">
                        <Link href={`/studio/person/${m.personA.id}`} className="hover:underline">
                          {displayName(m.personA.name)}
                        </Link>
                        {" + "}
                        <Link href={`/studio/person/${m.personB.id}`} className="hover:underline">
                          {displayName(m.personB.name)}
                        </Link>
                      </span>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.tone}`}>
                        {s.label}
                      </span>
                      {m.followUpAt && (
                        <span className="inline-flex items-center rounded-full border border-line bg-studio-subtle px-2.5 py-0.5 text-xs text-muted">
                          Follow up {m.followUpAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>
                    {m.rationale && <p className="mt-1 max-w-prose text-xs text-muted">{m.rationale}</p>}
                    {m.notes.length > 0 && (
                      <div className="mt-2 space-y-1 border-l-2 border-ink/25 pl-3">
                        <p className="label text-ink">Feedback</p>
                        {m.notes.map((n) => (
                          <p key={n.id} className="text-xs text-ink/80">
                            &ldquo;{n.body}&rdquo;{" "}
                            <span className="text-muted">
                              ({n.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })})
                            </span>
                          </p>
                        ))}
                      </div>
                    )}
                    <p className="mt-1 text-[11px] text-muted">
                      Updated {m.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {!isConnected && (
                      <>
                        <form action={resendIntro}>
                          <input type="hidden" name="matchId" value={m.id} />
                          <button className="btn-ghost text-xs">Resend</button>
                        </form>
                        {/* Connecting shares both members' contact details with
                            each other and cannot be taken back, and closing
                            ends the introduction. Both used to fire on the
                            first click, next to a Resend button. */}
                        <ConfirmActionForm
                          action={connectIntroNow}
                          confirmMessage="This shares both members' contact details with each other now, without waiting for a mutual yes."
                          triggerLabel="Connect now"
                          confirmLabel="Yes, connect them"
                          pendingText="Connecting..."
                          buttonClassName="rounded-full bg-ink px-3 py-1 text-xs font-medium text-white"
                        >
                          <input type="hidden" name="matchId" value={m.id} />
                        </ConfirmActionForm>
                        <ConfirmActionForm
                          action={closeIntroduction}
                          confirmMessage="This closes the introduction. Neither member hears about it again."
                          triggerLabel="Close"
                          confirmLabel="Close it"
                          pendingText="Closing..."
                          buttonClassName="btn-ghost text-xs text-muted"
                        >
                          <input type="hidden" name="matchId" value={m.id} />
                        </ConfirmActionForm>
                      </>
                    )}
                    {isConnected && (
                      <>
                        <form action={askForFeedback}>
                          <input type="hidden" name="matchId" value={m.id} />
                          <button className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-white">Ask for feedback</button>
                        </form>
                        <form action={setIntroFollowUp}>
                          <input type="hidden" name="matchId" value={m.id} />
                          <input type="hidden" name="days" value="7" />
                          <button className="btn-ghost text-xs">Follow up in 7d</button>
                        </form>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* People list */}
      <div>
        <h2 className="font-sans tracking-[-0.012em] text-lg font-medium">People ({people.length})</h2>
        <div
          className="mt-3 overflow-x-auto rounded-xl2 border border-line bg-panel shadow-card"
          role="region"
          aria-label="People ready for matchmaking"
          tabIndex={0}
        >
          <table className="roster min-w-[560px]">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>City</th>
                <th>Social</th>
                <th>Wants / notes</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium text-ink">
                    <span className="flex items-center gap-2">
                      <Avatar url={p.photos[0]?.url} name={p.name} size={28} />
                      <Link href={`/studio/person/${p.id}`} className="hover:underline">
                        {p.name}
                      </Link>
                      {p.openToMatch && (
                        <span className="inline-flex items-center rounded-full border border-ink/25 bg-studio-canvas px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink">
                          Ready
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="text-muted">{p.phone || <span className="text-ink">add a phone</span>}</td>
                  <td className="text-muted">{p.city}</td>
                  <td>
                    <SocialLinks instagram={p.instagram} linkedin={p.linkedin} />
                  </td>
                  <td className="max-w-[32ch] truncate text-muted">{p.lookingFor || p.bio || "-"}</td>
                  <td>
                    <Link
                      href={`/studio/person/${p.id}#introduce`}
                      className="whitespace-nowrap rounded-full border border-line px-3 py-1 text-xs text-ink transition hover:border-studio-line"
                    >
                      Introduce
                    </Link>
                  </td>
                </tr>
              ))}
              {people.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    No one yet. Add your first person above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Clickable Instagram / LinkedIn links for a person, or a muted dash when neither
// is on file. Values are stored canonical, so they render straight as hrefs.
function SocialLinks({ instagram, linkedin }: { instagram: string | null; linkedin: string | null }) {
  if (!instagram && !linkedin) return <span className="text-muted">-</span>;
  return (
    <span className="flex flex-wrap gap-2 text-xs">
      {instagram && (
        <a href={instagram} target="_blank" rel="noopener noreferrer" className="text-ink underline underline-offset-2 hover:opacity-80">
          Instagram
        </a>
      )}
      {linkedin && (
        <a href={linkedin} target="_blank" rel="noopener noreferrer" className="text-ink underline underline-offset-2 hover:opacity-80">
          LinkedIn
        </a>
      )}
    </span>
  );
}
