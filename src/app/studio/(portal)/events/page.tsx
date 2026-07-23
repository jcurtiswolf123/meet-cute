import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOperatorPage } from "@/lib/page-auth";
import { createEvent } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function Events() {
  await requireOperatorPage();

  const events = await prisma.dinner.findMany({
    include: { _count: { select: { attendees: true } } },
    orderBy: { date: "asc" },
  });
  const upcoming = events.filter((e) => e.status !== "done");
  const past = events.filter((e) => e.status === "done");

  return (
    <div className="max-w-4xl space-y-10">
      <div>
        <h1 className="font-display text-3xl font-medium">Events</h1>
        <p className="mt-1 text-sm text-muted">
          Curated dinners and gatherings. Create an event, then add invitees from the roster in one
          click. They get an email automatically.
        </p>
      </div>

      <section className="card p-6">
        <h2 className="label">New event</h2>
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
            <label className="block">
              <span className="label">City</span>
              <select name="city" defaultValue="NYC" className="field mt-1.5">
                <option value="NYC">NYC</option>
                <option value="San Francisco">SF</option>
              </select>
            </label>
            <label className="block">
              <span className="label">Date &amp; time</span>
              <input name="date" type="datetime-local" required className="field mt-1.5" />
            </label>
            <label className="block">
              <span className="label">Capacity</span>
              <input name="capacity" type="number" min={2} max={100} defaultValue={12} className="field mt-1.5" />
            </label>
          </div>
          <label className="block">
            <span className="label">Notes (optional)</span>
            <input name="notes" placeholder="Dietary notes, seating plan, dress code..." className="field mt-1.5" />
          </label>
          <div>
            <button type="submit" className="btn-primary">Create event</button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="label">Upcoming ({upcoming.length})</h2>
        {upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No upcoming events. Create one above.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {upcoming.map((e) => (
              <Link key={e.id} href={`/studio/events/${e.id}`} className="card block p-5 transition hover:border-claret/40">
                <div className="flex items-center justify-between">
                  <span className="pill">{e.city}</span>
                  <span className="text-xs text-muted">
                    {e._count.attendees}/{e.capacity} seats
                  </span>
                </div>
                <h3 className="mt-3 font-display text-xl font-medium">{e.theme}</h3>
                <p className="mt-1 text-sm text-muted">
                  {e.date.toLocaleString("en-US", { weekday: "short", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  {" · "}{e.venue}
                </p>
                <span className="mt-3 inline-block text-xs font-medium text-claret">Manage invitees →</span>
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
              <li key={e.id} className="flex items-center justify-between border-b border-line pb-2">
                <Link href={`/studio/events/${e.id}`} className="hover:underline">
                  {e.theme} · {e.city}
                </Link>
                <span>{e.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
