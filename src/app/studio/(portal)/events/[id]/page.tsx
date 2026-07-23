import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOperatorPage } from "@/lib/page-auth";
import { addEventInvitees, removeAttendee, setAttendeeStatus, setEventStatus } from "@/lib/actions";
import { Avatar } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  invited: "Invited", confirmed: "Confirmed", attended: "Attended", noshow: "No-show",
};

export default async function EventDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireOperatorPage();
  const { id } = await params;

  const event = await prisma.dinner.findUnique({
    where: { id },
    include: {
      attendees: {
        include: { person: { include: { photos: { where: { status: "approved" }, take: 1 } } } },
        orderBy: { status: "asc" },
      },
    },
  });
  if (!event) notFound();

  const attendeeIds = new Set(event.attendees.map((a) => a.personId));
  // Eligible invitees: active members in the same city, not already on the list.
  const eligible = await prisma.person.findMany({
    where: {
      status: "active", isOperator: false, isAmbassador: false, isCoach: false,
      city: event.city, id: { notIn: [...attendeeIds] },
    },
    include: { photos: { where: { status: "approved" }, take: 1 } },
    orderBy: { name: "asc" },
  });

  const confirmed = event.attendees.filter((a) => a.status === "confirmed" || a.status === "attended").length;

  return (
    <div className="max-w-4xl space-y-10">
      <div>
        <Link href="/studio/events" className="text-xs text-muted hover:underline">← All events</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-medium">{event.theme}</h1>
            <p className="mt-1 text-sm text-muted">
              <span className="pill mr-2">{event.city}</span>
              {event.date.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}
              {" · "}{event.venue}
            </p>
            {event.notes && <p className="mt-2 max-w-prose text-sm text-ink/80">{event.notes}</p>}
          </div>
          <form action={setEventStatus} className="flex items-center gap-2">
            <input type="hidden" name="dinnerId" value={event.id} />
            <select name="status" defaultValue={event.status} className="field !py-1.5 text-sm" aria-label="Event status">
              {["planned", "open", "full", "done"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button className="rounded-full border border-line px-3 py-1.5 text-xs hover:border-claret/40">Save</button>
          </form>
        </div>
        <p className="mt-3 text-sm text-muted">
          {event.attendees.length} invited · {confirmed} confirmed/attended · {event.capacity} seats
        </p>
      </div>

      {/* One-click add invitees from the roster */}
      <section className="card p-6">
        <h2 className="label">Add invitees</h2>
        <p className="mt-1 text-xs text-muted">
          Active {event.city} members not already invited. Check anyone and add them. Each gets an
          email automatically.
        </p>
        {eligible.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Everyone eligible is already on the list.</p>
        ) : (
          <form action={addEventInvitees} className="mt-4">
            <input type="hidden" name="dinnerId" value={event.id} />
            <div className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
              {eligible.map((m) => (
                <label key={m.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-paper">
                  <input type="checkbox" name="memberId" value={m.id} className="h-4 w-4 accent-claret" />
                  <Avatar url={m.photos[0]?.url} name={m.name} size={32} />
                  <span className="text-sm">
                    <span className="font-medium">{m.name}</span>
                    <span className="ml-2 text-xs text-muted">{m.neighborhood || m.city}{m.headline ? ` · ${m.headline.slice(0, 40)}` : ""}</span>
                  </span>
                </label>
              ))}
            </div>
            <button type="submit" className="btn-primary mt-4">Add &amp; email selected</button>
          </form>
        )}
      </section>

      {/* Current guest list */}
      <section>
        <h2 className="label">Guest list ({event.attendees.length})</h2>
        {event.attendees.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No invitees yet. Add some above.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {event.attendees.map((a) => (
              <li key={a.id} className="card flex flex-wrap items-center justify-between gap-3 p-3">
                <Link href={`/studio/person/${a.person.id}`} className="flex items-center gap-3 hover:underline">
                  <Avatar url={a.person.photos[0]?.url} name={a.person.name} size={36} />
                  <span className="text-sm font-medium">{a.person.name}</span>
                </Link>
                <div className="flex items-center gap-2">
                  <form action={setAttendeeStatus} className="flex items-center gap-2">
                    <input type="hidden" name="attendeeId" value={a.id} />
                    <select name="status" defaultValue={a.status} className="field !py-1 text-xs" aria-label="RSVP status">
                      {Object.entries(STATUS_LABEL).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    <button className="rounded-full border border-line px-2.5 py-1 text-xs hover:border-claret/40">Set</button>
                  </form>
                  <form action={removeAttendee}>
                    <input type="hidden" name="attendeeId" value={a.id} />
                    <button className="rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:border-claret/40 hover:text-claret">Remove</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
