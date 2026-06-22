import { getCurrentPerson } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setMyRsvp } from "@/lib/actions";
import { SubmitButton } from "@/components/forms";

export const dynamic = "force-dynamic";

export default async function MyEvents() {
  const me = (await getCurrentPerson())!;

  const invites = await prisma.dinnerAttendee.findMany({
    where: { personId: me.id, dinner: { status: { not: "done" } } },
    include: { dinner: true },
    orderBy: { dinner: { date: "asc" } },
  });

  return (
    <div className="mx-auto max-w-2xl animate-fadeup px-4 py-8">
      <p className="label mb-2">Invitations</p>
      <h1 className="font-display text-4xl font-medium tracking-tight">Your events</h1>
      <p className="mt-2 text-muted">Curated Meet Cute dinners you have been invited to.</p>

      {invites.length === 0 ? (
        <div className="card mt-8 p-8 text-center">
          <p className="text-muted">No invitations yet. When your matchmaker invites you to a dinner, it will appear here.</p>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {invites.map((inv) => {
            const d = inv.dinner;
            const rsvped = inv.status === "confirmed" || inv.status === "declined";
            return (
              <div key={inv.id} className="card p-6">
                <div className="flex items-center justify-between">
                  <span className="pill">{d.city}</span>
                  {inv.status === "confirmed" && <span className="pill border-sage/40 text-sage">Going</span>}
                  {inv.status === "declined" && <span className="pill text-muted">Declined</span>}
                  {inv.status === "invited" && <span className="pill text-claret">Invited</span>}
                </div>
                <h2 className="mt-4 font-display text-2xl font-medium">{d.theme}</h2>
                <p className="mt-1 text-sm text-muted">
                  {d.date.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  {" · "}{d.venue}
                </p>
                {d.notes && <p className="mt-3 text-sm leading-relaxed text-ink/85">{d.notes}</p>}

                <div className="mt-5 flex gap-3">
                  {inv.status !== "confirmed" && (
                    <form action={setMyRsvp}>
                      <input type="hidden" name="attendeeId" value={inv.id} />
                      <input type="hidden" name="choice" value="confirmed" />
                      <SubmitButton className="btn-primary" pendingText="Saving...">
                        {rsvped ? "Change to going" : "Count me in"}
                      </SubmitButton>
                    </form>
                  )}
                  {inv.status !== "declined" && (
                    <form action={setMyRsvp}>
                      <input type="hidden" name="attendeeId" value={inv.id} />
                      <input type="hidden" name="choice" value="declined" />
                      <SubmitButton className="btn-ghost" pendingText="...">
                        Can&apos;t make it
                      </SubmitButton>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
