import { prisma } from "@/lib/prisma";
import { getCurrentPerson } from "@/lib/auth";
import { requestDinnerSeat } from "@/lib/actions";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SubmitButton } from "@/components/forms";

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
    include: { _count: { select: { attendees: true } } },
    orderBy: { date: "asc" },
  });
  const upcoming = dinners.filter((d) => d.status !== "done");
  const past = dinners.filter((d) => d.status === "done");

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
                  {d.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · {d.venue}
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
                        <input name="name" required placeholder="Your name" className="field" />
                        <input name="email" type="email" required placeholder="you@email.com" className="field" />
                      </div>
                    )}
                    <textarea
                      name="note"
                      rows={2}
                      maxLength={600}
                      placeholder="Anything we should know? (optional)"
                      className="field"
                    />
                    <SubmitButton className="btn-primary text-sm" pendingText="Sending...">
                      Request this seat
                    </SubmitButton>
                  </form>
                </details>
              </article>
            );
          })}
          {!upcoming.length && (
            <div className="card p-6">
              <p className="text-sm text-muted">Next dates announced soon.</p>
              <details className="group mt-4">
                <summary className="btn-ghost w-fit cursor-pointer list-none text-sm">
                  Tell me about the next one
                </summary>
                <form action={requestDinnerSeat} className="mt-4 space-y-3 border-t border-line pt-4">
                  {me ? (
                    <p className="text-xs text-muted">Requesting as {me.name} ({me.email}).</p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input name="name" required placeholder="Your name" className="field" />
                      <input name="email" type="email" required placeholder="you@email.com" className="field" />
                    </div>
                  )}
                  <textarea name="note" rows={2} maxLength={600} placeholder="Which city, and anything we should know?" className="field" />
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
                  <span>{d.date.toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
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
