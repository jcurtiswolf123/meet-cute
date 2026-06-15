import { getCurrentPerson } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pickSlot, requestReference } from "@/lib/actions";
import { mutualFriends } from "@/lib/social";
import { Avatar, StageBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

function slotLabel(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

export default async function Matches() {
  const me = (await getCurrentPerson())!;
  const matches = await prisma.match.findMany({
    where: {
      stage: { in: ["mutual_yes", "date_scheduled", "first_date", "second_date", "relationship"] },
      OR: [{ personAId: me.id }, { personBId: me.id }],
    },
    include: {
      personA: { include: { photos: true } },
      personB: { include: { photos: true } },
      thread: { include: { venue: true, messages: { orderBy: { createdAt: "asc" } } } },
      references: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!matches.length) {
    return (
      <div className="mx-auto max-w-md py-16 text-center text-muted">
        <h1 className="font-display text-2xl text-ink">No matches yet</h1>
        <p className="mt-2">When you and someone both say yes, they show up here and the concierge gets to work.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-3xl font-medium">Your matches</h1>
      {await Promise.all(
        matches.map(async (m) => {
          const other = m.personAId === me.id ? m.personB : m.personA;
          const t = m.thread;
          const slots: string[] = t?.proposedSlots ? JSON.parse(t.proposedSlots) : [];
          const myPick = t ? (m.personAId === me.id ? t.aPick : t.bPick) : null;
          const myMessages = (t?.messages ?? []).filter(
            (msg) => msg.direction === "out" && (msg.toPersonId === null || msg.toPersonId === me.id)
          );
          const mutuals = await mutualFriends(me.id, other.id);
          const existingRef = m.references.find((r) => r.requesterId === me.id);

          return (
            <div key={m.id} className="card overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-line p-5">
                <div className="flex items-center gap-3">
                  <Avatar url={other.photos[0]?.url} name={other.name} size={48} />
                  <div>
                    <div className="font-display text-xl font-medium">{other.name.split(" ")[0]}</div>
                    <div className="text-xs text-muted">{other.headline}</div>
                  </div>
                </div>
                <StageBadge stage={m.stage} />
              </div>

              {/* concierge transcript */}
              {t && (
                <div className="space-y-2 bg-cream/50 p-5">
                  <p className="label flex items-center gap-2">
                    <span className="text-claret">✦</span> Concierge
                  </p>
                  {myMessages.map((msg) => (
                    <div key={msg.id} className="rounded-lg bg-white px-3.5 py-2.5 text-sm shadow-card">
                      {msg.body}
                    </div>
                  ))}

                  {/* slot picker */}
                  {(t.state === "proposing" || t.state === "round2") && (
                    <div className="pt-2">
                      {myPick ? (
                        <p className="text-sm text-muted">You picked {slotLabel(myPick)}. Waiting on {other.name.split(" ")[0]}.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {slots.map((s) => (
                            <form key={s} action={pickSlot.bind(null, t.id, s)}>
                              <button className="btn-ghost text-sm">{slotLabel(s)}</button>
                            </form>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {t.state === "confirmed" && t.confirmedSlot && (
                    <a
                      href={`/api/ics/${t.id}`}
                      className="btn-primary mt-1 text-sm"
                    >
                      Add to calendar
                    </a>
                  )}
                  {t.state === "handoff" && (
                    <p className="text-sm text-claret">A matchmaker is reaching out personally.</p>
                  )}
                </div>
              )}

              {/* active reference: ask a mutual friend */}
              {mutuals.length > 0 && (
                <div className="border-t border-line p-5">
                  {existingRef ? (
                    existingRef.reply ? (
                      <div className="rounded-lg border border-sage/30 bg-sage/10 p-3 text-sm">
                        <p className="label">A friend weighed in</p>
                        <p className="mt-1 italic">&ldquo;{existingRef.reply}&rdquo;</p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted">We asked a mutual friend for the inside scoop. Hang tight.</p>
                    )
                  ) : (
                    <div>
                      <p className="label mb-2">Ask a mutual friend for the inside scoop</p>
                      <div className="flex flex-wrap gap-2">
                        {mutuals.map((f) => (
                          <form key={f.id} action={requestReference.bind(null, m.id, f.id)}>
                            <button className="pill hover:border-claret/40">Ask {f.name.split(" ")[0]}</button>
                          </form>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
