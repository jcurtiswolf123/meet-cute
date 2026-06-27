import { prisma } from "@/lib/prisma";
import { getCurrentPerson } from "@/lib/auth";
import { quickAddPerson, resendIntro, closeIntroduction, connectIntroNow } from "@/lib/actions";
import { IntroComposer } from "./IntroComposer";

export const dynamic = "force-dynamic";

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

type Decision = "pending" | "yes" | "pass";

function statusFor(m: { stage: string; aDecision: string; bDecision: string; personA: { name: string }; personB: { name: string } }) {
  const a = m.aDecision as Decision;
  const b = m.bDecision as Decision;
  if (m.stage === "connected") return { label: "Connected", tone: "bg-sage/15 text-sage border-sage/30" };
  if (m.stage === "exit") {
    const passer = a === "pass" ? firstName(m.personA.name) : b === "pass" ? firstName(m.personB.name) : null;
    return { label: passer ? `${passer} passed` : "Closed", tone: "bg-paper text-muted border-line" };
  }
  if (a === "yes" && b === "pending") return { label: `${firstName(m.personA.name)} said yes`, tone: "bg-claret/10 text-claret border-claret/25" };
  if (b === "yes" && a === "pending") return { label: `${firstName(m.personB.name)} said yes`, tone: "bg-claret/10 text-claret border-claret/25" };
  return { label: "Awaiting both", tone: "bg-champagne/20 text-ink border-champagne/40" };
}

export default async function Matchmaking() {
  const me = await getCurrentPerson();
  const operatorName = me?.name || "your matchmaker";

  const [people, intros] = await Promise.all([
    prisma.person.findMany({
      where: { isOperator: false, isAmbassador: false, isCoach: false, status: { in: ["active", "applicant"] } },
      select: { id: true, name: true, phone: true, city: true, bio: true },
      orderBy: { name: "asc" },
    }),
    prisma.match.findMany({
      where: { stage: { in: ["invited", "mutual_yes", "connected"] } },
      include: {
        personA: { select: { id: true, name: true, phone: true } },
        personB: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const awaiting = intros.filter((m) => m.stage !== "connected").length;
  const connected = intros.filter((m) => m.stage === "connected").length;
  const noPhone = people.filter((p) => !p.phone).length;

  const composerPeople = people.map((p) => ({ id: p.id, name: p.name, phone: p.phone, city: p.city }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-medium">Matchmaking</h1>
        <p className="mt-1 text-sm text-muted">
          Your console for connecting people over text. No profiles required - just a name and a number.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Awaiting replies", value: awaiting },
          { label: "Connected", value: connected },
          { label: "People", value: people.length },
          { label: "Missing a phone", value: noPhone },
        ].map((k) => (
          <div key={k.label} className="card p-4">
            <div className="font-display text-2xl text-ink">{k.value}</div>
            <div className="mt-0.5 text-xs uppercase tracking-wide text-muted">{k.label}</div>
          </div>
        ))}
      </div>

      <IntroComposer people={composerPeople} operatorName={operatorName} />

      {/* Quick-add a person */}
      <details className="card p-5">
        <summary className="cursor-pointer font-display text-lg font-medium">Add someone to match</summary>
        <p className="mt-1 text-sm text-muted">
          A name and mobile number is all you need. They don&apos;t have to sign up or build a profile.
        </p>
        <form action={quickAddPerson} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Name</span>
            <input name="name" required placeholder="Jordan Rivera" className="field mt-1.5" />
          </label>
          <label className="block">
            <span className="label">Mobile number</span>
            <input name="phone" required type="tel" placeholder="(555) 123-4567" className="field mt-1.5" />
          </label>
          <label className="block">
            <span className="label">City</span>
            <select name="city" defaultValue="NYC" className="field mt-1.5">
              <option value="NYC">NYC</option>
              <option value="SF">SF</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Email (optional)</span>
            <input name="email" type="email" placeholder="optional" className="field mt-1.5" />
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Notes about them (optional)</span>
            <input name="blurb" placeholder="Founder, loves trail running, wants something serious." className="field mt-1.5" />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary">Add person</button>
          </div>
        </form>
      </details>

      {/* Introductions board */}
      <div>
        <h2 className="font-display text-lg font-medium">Introductions</h2>
        {intros.length === 0 ? (
          <div className="card mt-3 p-8 text-center text-sm text-muted">
            No introductions yet. Pick two people above and send your first intro texts.
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {intros.map((m) => {
              const s = statusFor(m);
              return (
                <div key={m.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">
                        {firstName(m.personA.name)} + {firstName(m.personB.name)}
                      </span>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.tone}`}>
                        {s.label}
                      </span>
                    </div>
                    {m.rationale && <p className="mt-1 max-w-prose text-xs text-muted">{m.rationale}</p>}
                    <p className="mt-1 text-[11px] text-muted">
                      Updated {m.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {m.stage !== "connected" && (
                      <form action={resendIntro}>
                        <input type="hidden" name="matchId" value={m.id} />
                        <button className="btn-ghost text-xs">Resend</button>
                      </form>
                    )}
                    {m.stage !== "connected" && (
                      <form action={connectIntroNow}>
                        <input type="hidden" name="matchId" value={m.id} />
                        <button className="rounded-full bg-claret px-3 py-1 text-xs font-medium text-white">Connect now</button>
                      </form>
                    )}
                    {m.stage !== "connected" && (
                      <form action={closeIntroduction}>
                        <input type="hidden" name="matchId" value={m.id} />
                        <button className="btn-ghost text-xs text-muted">Close</button>
                      </form>
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
        <h2 className="font-display text-lg font-medium">People ({people.length})</h2>
        <div className="mt-3 overflow-x-auto rounded-xl2 border border-line bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-line bg-paper/60 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">City</th>
                <th className="px-4 py-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="border-b border-line/70 hover:bg-cream/60">
                  <td className="px-4 py-3 font-medium text-ink">{p.name}</td>
                  <td className="px-4 py-3 text-muted">{p.phone || <span className="text-claret">add a phone</span>}</td>
                  <td className="px-4 py-3 text-muted">{p.city}</td>
                  <td className="max-w-[32ch] truncate px-4 py-3 text-muted">{p.bio || "-"}</td>
                </tr>
              ))}
              {people.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted">
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
