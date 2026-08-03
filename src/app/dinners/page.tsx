import { prisma } from "@/lib/prisma";
import { getCurrentPerson } from "@/lib/auth";
import { requestDinnerSeat } from "@/lib/actions";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SubmitButton } from "@/components/forms";
import { LabelledField } from "@/components/LabelledField";
import { formatEventDay, isPastEvent } from "@/lib/event-time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dinners" };

export default async function Dinners({
  searchParams,
}: {
  searchParams: Promise<{ requested?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const me = await getCurrentPerson();
  const dinners = await prisma.dinner.findMany({
    // Seats left has to count people who are actually coming. Counting every
    // attendee row included invited-but-unanswered and noshow records, so a
    // dinner could advertise "0 of 12 seats left" while half the table was
    // still open.
    include: {
      _count: { select: { attendees: { where: { status: { in: ["confirmed", "attended"] } } } } },
    },
    orderBy: { date: "asc" },
  });
  // A dinner is upcoming if it has not happened yet. Filtering on status alone
  // meant any dinner an operator forgot to mark "done" stayed under Upcoming
  // forever, still taking seat requests for a date that had passed. Compare on
  // the calendar day so a dinner is not dropped partway through its own evening.
  // "Today" is today in the dinner's own city, not on the server, which runs
  // UTC in production and so retired a West Coast dinner while it was still
  // that afternoon there.
  const isPast = (d: (typeof dinners)[number]) => d.status === "done" || isPastEvent(d.date, d.city);
  const upcoming = dinners.filter((d) => !isPast(d));
  // Soonest first for upcoming, most recent first for the archive.
  const past = dinners.filter(isPast).reverse();

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="container-mc min-h-screen py-12 md:py-20">
        <div className="max-w-[62ch]">
          <p className="public-label text-muted">Mutuals Dinners</p>
          <h1 className="mt-5 font-display text-5xl leading-[0.98] tracking-[-0.03em] sm:text-6xl">
            Twelve people, one long table.
          </h1>
          <p className="mt-5 text-lg leading-8 text-muted">
            Monthly dinners in New York and San Francisco. Half the fun is who else is at the table.
            Come for the dinner alone, or as the easiest way to meet everyone at once.
          </p>
        </div>

        {sp?.requested && (
          <div className="mt-8 rounded-lg border border-ink/15 bg-panel px-5 py-4 text-sm text-ink">
            Request received. A matchmaker will follow up personally with next steps.
          </div>
        )}
        {sp?.error && (
          <div className="mt-8 rounded-lg border border-claret/30 bg-claret/5 px-5 py-4 text-sm text-claret">
            {sp.error === "send"
              ? "We could not record your request just now. Please try again, or email hello@hellomutuals.com and we will hold a seat."
              : sp.error === "throttled"
                ? "That is a lot of requests from your network in a short window, so we did not record this one. Try again in a little while, or email hello@hellomutuals.com and we will hold a seat."
                : "We need your name and email to hold a seat. Please try again."}
          </div>
        )}

        <h2 className="public-label mt-16 text-muted">Upcoming</h2>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {upcoming.map((d) => {
            const seatsLeft = Math.max(0, d.capacity - d._count.attendees);
            return (
              <article key={d.id} className="card flex flex-col p-6">
                <div className="flex items-center justify-between">
                  <span className="pill">{d.city}</span>
                  <span className="text-xs text-muted tabular-nums">
                    {seatsLeft > 0 ? `${seatsLeft} of ${d.capacity} seats left` : "Waitlist"}
                  </span>
                </div>
                <h3 className="mt-4 font-display text-2xl font-medium">{d.theme}</h3>
                <p className="mt-1 text-sm text-muted">
                  {formatEventDay(d.date, d.city, { weekday: "long", month: "long", day: "numeric" })} · {d.venue}
                </p>

                <details className="group mt-5">
                  <summary className="btn-ghost w-fit cursor-pointer list-none text-sm">
                    Request a seat
                  </summary>
                  <form action={requestDinnerSeat} className="mt-4 space-y-3 border-t border-line pt-4">
                    <input type="hidden" name="dinnerId" value={d.id} />
                    {me ? (
                      <p className="text-xs text-muted">
                        Requesting as {me.name} ({me.email}).
                      </p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <LabelledField id={`seat-name-${d.id}`} label="Your name">
                          <input
                            id={`seat-name-${d.id}`}
                            name="name"
                            required
                            autoComplete="name"
                            className="field mt-1.5"
                          />
                        </LabelledField>
                        <LabelledField id={`seat-email-${d.id}`} label="Email">
                          <input
                            id={`seat-email-${d.id}`}
                            name="email"
                            type="email"
                            required
                            autoComplete="email"
                            className="field mt-1.5"
                          />
                        </LabelledField>
                      </div>
                    )}
                    <LabelledField id={`seat-note-${d.id}`} label="Anything we should know? (optional)">
                      <textarea
                        id={`seat-note-${d.id}`}
                        name="note"
                        rows={2}
                        maxLength={600}
                        className="field mt-1.5"
                      />
                    </LabelledField>
                    <SubmitButton className="btn-primary text-sm" pendingText="Sending...">
                      Request this seat
                    </SubmitButton>
                  </form>
                </details>
              </article>
            );
          })}
          {!upcoming.length && (
            /* With no dinners on the books this was one half-width card in a
               two-column grid, so the row sat half empty and the page read
               unfinished rather than between seatings. */
            <div className="card p-6 md:col-span-2">
              <p className="text-sm text-muted">
                Next dates announced soon. Tell us where you are and we will let you know first.
              </p>
              <details className="group mt-4">
                <summary className="btn-ghost w-fit cursor-pointer list-none text-sm">
                  Tell me about the next one
                </summary>
                <form action={requestDinnerSeat} className="mt-4 max-w-xl space-y-3 border-t border-line pt-4">
                  {me ? (
                    <p className="text-xs text-muted">Requesting as {me.name} ({me.email}).</p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <LabelledField id="notify-name" label="Your name">
                        <input id="notify-name" name="name" required autoComplete="name" className="field mt-1.5" />
                      </LabelledField>
                      <LabelledField id="notify-email" label="Email">
                        <input
                          id="notify-email"
                          name="email"
                          type="email"
                          required
                          autoComplete="email"
                          className="field mt-1.5"
                        />
                      </LabelledField>
                    </div>
                  )}
                  <LabelledField id="notify-note" label="Which city, and anything we should know?">
                    <textarea id="notify-note" name="note" rows={2} maxLength={600} className="field mt-1.5" />
                  </LabelledField>
                  <SubmitButton className="btn-primary text-sm" pendingText="Sending...">
                    Keep me posted
                  </SubmitButton>
                </form>
              </details>
            </div>
          )}
        </div>

        {past.length > 0 && (
          <>
            <h2 className="public-label mt-16 text-muted">Past</h2>
            <ul className="mt-5 divide-y divide-line border-t border-line text-sm text-muted">
              {past.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-3">
                  <span>{d.theme} · {d.city}</span>
                  <span>{formatEventDay(d.date, d.city, { month: "short", year: "numeric" })}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
