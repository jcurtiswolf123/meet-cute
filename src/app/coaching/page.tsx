import { prisma } from "@/lib/prisma";
import { getCurrentPerson } from "@/lib/auth";
import { requestCoaching } from "@/lib/actions";
import { Avatar } from "@/components/ui";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SubmitButton } from "@/components/forms";

export const dynamic = "force-dynamic";

export default async function Coaching({
  searchParams,
}: {
  searchParams: Promise<{ requested?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const me = await getCurrentPerson();
  const coaches = await prisma.person.findMany({ where: { isCoach: true }, orderBy: { name: "asc" } });

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="container-mc min-h-screen py-12 md:py-20">
        <div className="max-w-[62ch]">
          <p className="public-label text-muted">Coaching</p>
          <h1 className="mt-5 font-display text-5xl leading-[0.98] tracking-[-0.03em] sm:text-6xl">
            We helped you meet. Now we help you build it.
          </h1>
          <p className="mt-5 text-lg leading-8 text-muted">
            A small bench of hand-picked coaches. Dating coaching for people on the roster - profile
            help, date prep, post-date debriefs. Couples coaching for the pairs who met through us, and
            the ones who found each other elsewhere.
          </p>
        </div>

        {sp?.requested && (
          <div className="mt-8 rounded-lg border border-ink/15 bg-panel px-5 py-4 text-sm text-ink">
            Request received. A matchmaker will follow up personally to match you with the right coach.
          </div>
        )}
        {sp?.error && (
          <div className="mt-8 rounded-lg border border-claret/30 bg-claret/5 px-5 py-4 text-sm text-claret">
            {sp.error === "send"
              ? "We could not record your request just now. Please try again, or email hello@hellomutuals.com and we will pick it up from there."
              : "We need your name and email to follow up. Please try again."}
          </div>
        )}

        <div className="mt-14 grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <h2 className="public-label text-muted">The bench</h2>
            {coaches.length > 0 ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {coaches.map((c) => (
                  <div key={c.id} className="card flex items-center gap-4 p-5">
                    <Avatar name={c.name} size={52} />
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted">{c.coachBio ?? "Coach"}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-5 text-sm text-muted">
                Coaches are introduced privately once we understand what you are working on.
              </p>
            )}
          </div>

          <aside className="lg:col-span-5">
            <div className="card p-6">
              <h2 className="font-display text-2xl font-medium">Apply for coaching</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Tell us a little about what you want to work on and we will match you with a coach.
              </p>
              <form action={requestCoaching} className="mt-5 space-y-3">
                <div>
                  <label className="label" htmlFor="type">What kind?</label>
                  <select id="type" name="type" className="field mt-1.5">
                    <option value="dating">Dating coaching (for me)</option>
                    <option value="couples">Couples coaching (for us)</option>
                  </select>
                </div>
                {me ? (
                  <p className="text-xs text-muted">Applying as {me.name} ({me.email}).</p>
                ) : (
                  <>
                    <input name="name" required placeholder="Your name" className="field" />
                    <input name="email" type="email" required placeholder="you@email.com" className="field" />
                  </>
                )}
                <textarea
                  name="note"
                  rows={3}
                  maxLength={600}
                  placeholder="What would you like help with?"
                  className="field"
                />
                <SubmitButton className="btn-primary w-full text-sm" pendingText="Sending...">
                  Apply for coaching
                </SubmitButton>
              </form>
            </div>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
