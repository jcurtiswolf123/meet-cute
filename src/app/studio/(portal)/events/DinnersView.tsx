import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createEvent } from "@/lib/actions";
import { formatEventWhen, formatEventDay } from "@/lib/event-time";
import { Select } from "@/components/select";
import { CITIES } from "@/lib/cities";

export async function upcomingEventCount(): Promise<number> {
  return prisma.dinner.count({ where: { status: { not: "done" } } });
}

export async function DinnersView() {
  const events = await prisma.dinner.findMany({
    relationLoadStrategy: "join",
    include: { _count: { select: { attendees: true } } },
    orderBy: { date: "asc" },
  });
  const upcoming = events.filter((e) => e.status !== "done");
  const past = events.filter((e) => e.status === "done");

  return (
    <div className="max-w-4xl space-y-10">
      {/* The form used to sit above the events. On a phone that meant scrolling
          a six-field form to reach the thing you came to look at, every time.
          Collapsed, and after the list, matching the quick-add on Matchmaking. */}
      <section>
        <h2 className="label">Upcoming ({upcoming.length})</h2>
        {upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No upcoming events. Create one below.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {upcoming.map((e) => (
              <Link
                key={e.id}
                href={`/studio/events/${e.id}`}
                className="card block p-5 transition hover:border-studio-line"
              >
                <div className="flex items-center justify-between">
                  <span className="pill">{e.city}</span>
                  <span className="text-xs text-muted">
                    {e._count.attendees}/{e.capacity} seats
                  </span>
                </div>
                <h3 className="mt-3 font-sans tracking-[-0.012em] text-xl font-medium">{e.theme}</h3>
                <p className="mt-1 text-sm text-muted">
                  {formatEventWhen(e.date, e.city)}
                  {" · "}
                  {e.venue}
                </p>
                <span className="mt-3 inline-block text-xs font-medium text-ink">Manage invitees</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="label">Past</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            {past.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 border-b border-line pb-2">
                <Link href={`/studio/events/${e.id}`} className="min-w-0 truncate hover:underline">
                  {e.theme} · {e.city}
                </Link>
                <span className="shrink-0">
                  {formatEventDay(e.date, e.city, { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="card p-6" open={upcoming.length === 0}>
        <summary className="cursor-pointer text-sm font-medium">New event</summary>
        <form action={createEvent} className="mt-4 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Theme</span>
              <input name="theme" placeholder="Long-table supper" className="field mt-1.5" />
            </label>
            <label className="block">
              <span className="label">Venue</span>
              <input name="venue" required placeholder="Via Carota" className="field mt-1.5" />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              name="city"
              label="City"
              showLabel
              defaultValue="NYC"
              options={CITIES.map((c) => ({ value: c.value, label: c.short }))}
            />
            <label className="block">
              <span className="label">Date &amp; time</span>
              <input name="date" type="datetime-local" required className="field mt-1.5" />
            </label>
            <label className="block">
              <span className="label">Capacity</span>
              <input
                name="capacity"
                type="number"
                min={2}
                max={100}
                defaultValue={12}
                className="field mt-1.5"
              />
            </label>
          </div>
          <label className="block">
            <span className="label">Notes (optional)</span>
            <input name="notes" placeholder="Dietary notes, seating plan, dress code..." className="field mt-1.5" />
          </label>
          <div>
            <button type="submit" className="btn-primary">
              Create event
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}
